"""The relay must cancel a RunPod job it stops waiting on (viewer disconnect,
broken poll), or the job keeps a paid worker up. Mocked httpx, no network."""
import asyncio, sys, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server


class FakeResp:
    def __init__(self, body, code=200):
        self._body, self.status_code, self.text = body, code, str(body)

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


def fake_client(statuses, calls, health=None):
    """An httpx.AsyncClient stand-in: /run returns job j1, each /status poll
    pops the next body, every request is recorded in `calls`."""
    class Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, **k):
            calls.append(("POST", url))
            return FakeResp({"id": "j1"})
        async def get(self, url, **k):
            calls.append(("GET", url))
            if url.endswith("/health"):
                return FakeResp(health)
            return FakeResp(statuses.pop(0) if statuses else {"status": "IN_QUEUE"})
    return Client


TOKEN = {"type": "token", "t": "a"}


class CancelTests(unittest.TestCase):
    def run_stream(self, statuses, take=None, health=None, clock=None):
        calls = []
        async def go():
            with mock.patch("httpx.AsyncClient", fake_client(statuses, calls, health)), \
                 mock.patch.object(server.time, "time", clock or server.time.time), \
                 mock.patch.object(server, "_RUNPOD_URL", "https://x/v2/ep"), \
                 mock.patch.object(server, "_RUNPOD_KEY", "k"), \
                 mock.patch("asyncio.sleep", mock.AsyncMock()):
                gen = server._runpod_stream({"prompt": "p"})
                got = []
                async for ev in gen:
                    got.append(ev)
                    if take is not None and len(got) >= take:
                        break
                await gen.aclose()           # what a disconnect does
                await asyncio.sleep(0)       # let the cancel task run
                for t in asyncio.all_tasks() - {asyncio.current_task()}:
                    await t
                return got
        return asyncio.run(go()), calls

    def cancels(self, calls):
        return [u for m, u in calls if m == "POST" and "/cancel/" in u]

    def test_completed_job_is_not_cancelled(self):
        got, calls = self.run_stream([{"status": "COMPLETED", "output": [TOKEN]}])
        self.assertEqual(got, [("token", TOKEN)])
        self.assertEqual(self.cancels(calls), [])

    def test_viewer_disconnect_cancels_running_job(self):
        got, calls = self.run_stream(
            [{"status": "IN_PROGRESS", "output": [TOKEN]}], take=1)
        self.assertEqual(len(got), 1)
        self.assertEqual(self.cancels(calls), ["https://x/v2/ep/cancel/j1"])

    def test_broken_poll_cancels_job(self):
        _, calls = self.run_stream([FakeResp(ValueError("html"))._body])
        self.assertEqual(self.cancels(calls), ["https://x/v2/ep/cancel/j1"])


    def test_queued_with_no_workers_gives_up_and_cancels(self):
        ticks = iter(range(0, 10_000, 5))          # each time() call: +5s
        got, calls = self.run_stream(
            [], health={"workers": {"idle": 0, "initializing": 0, "running": 0}},
            clock=lambda: next(ticks))
        self.assertEqual(got, [])                  # relay falls back locally
        self.assertTrue(any(u.endswith("/health") for m, u in calls))
        self.assertEqual(self.cancels(calls), ["https://x/v2/ep/cancel/j1"])
        polls = [u for m, u in calls if "/status/" in u]
        self.assertLess(len(polls), 10)            # not the whole 650s deadline

    def test_cold_start_keeps_waiting(self):
        ticks = iter(range(0, 10_000, 5))
        got, calls = self.run_stream(
            [{"status": "IN_QUEUE"}] * 8 + [{"status": "COMPLETED", "output": [TOKEN]}],
            health={"workers": {"initializing": 1}}, clock=lambda: next(ticks))
        self.assertEqual(got, [("token", TOKEN)])
        self.assertEqual(self.cancels(calls), [])


if __name__ == "__main__":
    unittest.main()
