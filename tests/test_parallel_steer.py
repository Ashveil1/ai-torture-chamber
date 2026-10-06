"""GPU-delegated /steer runs must not serialize on _STEER_LOCK (that lock
guards the relay's own model only): two visitors' runs overlap in time.
Mocked GPU, no model load, no network."""
import asyncio, sys, time, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server
import httpx


async def slow_gpu(job, ep=None):
    yield "run", {"type": "run", "valence": job.get("valence"), "dose": job.get("dose")}
    await asyncio.sleep(0.6)
    yield "token", {"type": "token", "t": "hello"}
    yield "done", {"type": "done"}


class ParallelSteerTests(unittest.TestCase):
    def test_two_gpu_runs_overlap(self):
        async def go():
            transport = httpx.ASGITransport(app=server.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
                body = {"valence": "pain", "dose": 4, "framing": "no extra info"}
                t0 = time.time()
                rs = await asyncio.gather(
                    c.post("/steer", json=body, headers={"x-forwarded-for": "1.1.1.1"}),
                    c.post("/steer", json=body, headers={"x-forwarded-for": "2.2.2.2"}))
                return time.time() - t0, rs
        with mock.patch.dict(server._state, {"ready": True}), \
             mock.patch.object(server, "_RUNPOD_URL", "https://x/v2/ep"), \
             mock.patch.object(server, "_RUNPOD_KEY", "k"), \
             mock.patch.object(server, "_runpod_stream", slow_gpu), \
             mock.patch.object(server, "_record_run", lambda e: None):
            took, rs = asyncio.run(go())
        for r in rs:
            self.assertEqual(r.status_code, 200)
            self.assertIn("event: done", r.text)
        self.assertLess(took, 1.1)     # serialized would be >= 1.2s


if __name__ == "__main__":
    unittest.main()
