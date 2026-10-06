"""The research log (chamber:events): every visitor choice is recorded with
what they asked for and what actually ran, never a raw IP; client events are
whitelisted; the export needs the token. Mocked GPU and Redis; no model."""
import asyncio, json, sys, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server
import httpx


async def gpu(job):
    yield "run", {"type": "run"}
    yield "token", {"type": "token", "t": "It hurts, "}
    yield "token", {"type": "token", "t": "but I stay."}
    yield "done", {"type": "done", "press_logit": -1.5}


class FakeRedis:
    def __init__(self):
        self.rows = []

    def pipeline(self):
        return self

    def lpush(self, key, v):
        if key == server.EVENTS_KEY:
            self.rows.insert(0, v)

    def ltrim(self, *a):
        pass

    def execute(self):
        pass

    def lrange(self, key, a, b):
        return self.rows[a:b + 1]


class EventTests(unittest.TestCase):
    def setUp(self):
        self.r = FakeRedis()
        self.patches = [mock.patch.object(server, "_redis", lambda: self.r),
                        mock.patch.object(server, "_bg", lambda fn, *a: fn(*a))]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()

    def logged(self, kind=None):
        rows = [json.loads(x) for x in self.r.rows]
        return [e for e in rows if kind is None or e["kind"] == kind]

    def call(self, method, path, **kw):
        async def go():
            t = httpx.ASGITransport(app=server.app)
            async with httpx.AsyncClient(transport=t, base_url="http://t") as c:
                return await c.request(method, path, **kw)
        with mock.patch.dict(server._state, {"ready": True}), \
             mock.patch.object(server, "_RUNPOD_URL", "https://x/v2/ep"), \
             mock.patch.object(server, "_RUNPOD_KEY", "k"), \
             mock.patch.object(server, "_runpod_stream", gpu), \
             mock.patch.object(server, "chat_prompt", lambda p, s=None: p), \
             mock.patch.object(server, "_record_run", lambda e: e.update(uid=41)):
            return asyncio.run(go())

    def test_run_records_request_band_and_visitor_not_ip(self):
        self.call("POST", "/steer", json={"mix": {"pain": 1.0}, "visitor": "v-abcdef123",
                                          "prompt": "please don't press"},
                  headers={"x-forwarded-for": "5.6.7.8", "referer": "https://wirehead.agency/button.html"})
        [e] = self.logged("run")
        self.assertEqual(e["visitor"], "v-abcdef123")
        self.assertEqual(e["requested"], {"mix": {"pain": 1.0}})
        self.assertAlmostEqual(8 * sum(e["applied"].values()), server.coherent_cap(), places=2)
        self.assertEqual(e["prompt"], "please don't press")
        self.assertEqual(e["text"], "It hurts, but I stay.")
        self.assertEqual(e["page"], "/button.html")
        self.assertFalse(e["past_cliff"])
        self.assertEqual(e["uid"], 41)
        self.assertNotIn("5.6.7.8", json.dumps(e))
        self.assertEqual(len(e["ip_hash"]), 16)

    def test_bad_visitor_id_is_dropped(self):
        self.call("POST", "/steer", json={"mix": {"pain": 0.2}, "visitor": "<script>"})
        self.assertIsNone(self.logged("run")[0]["visitor"])

    def test_client_events_whitelisted_and_bounded(self):
        ok = self.call("POST", "/event", json={"kind": "button_end", "visitor": "v-abcdef123",
                                               "layer": "anomaly", "outcome": "held"})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(self.logged("button_end")[0]["outcome"], "held")
        self.assertEqual(self.call("POST", "/event", json={"kind": "wrongfloor_answer", "set": "rating",
                                                           "which_pain": "B"}).status_code, 200)
        self.assertEqual(self.call("POST", "/event", json={"kind": "run"}).status_code, 400)
        big = {"kind": "button_turn", "text": "x" * 9000}
        self.assertEqual(self.call("POST", "/event", json=big).status_code, 413)

    def test_export_needs_token(self):
        self.call("POST", "/event", json={"kind": "survey", "answer": "maybe"})
        with mock.patch.object(server, "_EXPORT_TOKEN", ""):
            self.assertEqual(self.call("GET", "/events/export").status_code, 404)
        with mock.patch.object(server, "_EXPORT_TOKEN", "tok"):
            self.assertEqual(self.call("GET", "/events/export",
                                       headers={"authorization": "Bearer nope"}).status_code, 404)
            r = self.call("GET", "/events/export", headers={"authorization": "Bearer tok"})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(json.loads(r.text.splitlines()[0])["answer"], "maybe")
            r = self.call("GET", "/events/export?since=9999999999",
                          headers={"authorization": "Bearer tok"})
            self.assertEqual(r.text, "")


if __name__ == "__main__":
    unittest.main()
