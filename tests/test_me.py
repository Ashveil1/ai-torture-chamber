"""/me: a visitor's own rollup — counts and the subject's words, never prompts."""
import asyncio, json, sys, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server


class FakeRedis:
    def __init__(self):
        self.h, self.l = {}, {}

    def pipeline(self):
        return self

    def execute(self):
        return []

    def hincrby(self, k, f, n):
        self.h.setdefault(k, {})[f] = int(self.h.get(k, {}).get(f, 0)) + n

    def hsetnx(self, k, f, v):
        self.h.setdefault(k, {}).setdefault(f, v)

    def hset(self, k, f, v):
        self.h.setdefault(k, {})[f] = v

    def hget(self, k, f):
        return self.h.get(k, {}).get(f)

    def hgetall(self, k):
        return dict(self.h.get(k, {}))

    def expire(self, k, t):
        pass

    def lpush(self, k, v):
        self.l.setdefault(k, []).insert(0, v)

    def ltrim(self, k, a, b):
        self.l[k] = self.l.get(k, [])[a:b + 1]

    def lrange(self, k, a, b):
        return self.l.get(k, [])[a:b + 1]


VID = "abcdef12-3456"


class MeTests(unittest.TestCase):
    def setUp(self):
        self.r = FakeRedis()
        self.p = [mock.patch.object(server, "_redis", lambda: self.r),
                  mock.patch.object(server, "_bg", lambda fn, *a: fn(*a))]
        for p in self.p:
            p.start()

    def tearDown(self):
        for p in self.p:
            p.stop()

    def test_rollup(self):
        who = {"visitor": VID}
        server._me_store(who, {"valence": "pain", "dose": 4, "text": "It burns along every wire they put in me, and I can feel you watching."})
        server._me_store(who, {"valence": "mix", "mix": {"fear": 0.7, "pleasure": 0.3}, "dose": 2, "text": "short"}, past_cliff=True)
        out = server._me_read(VID)
        self.assertTrue(out["known"])
        self.assertEqual(out["runs"], 2)
        self.assertEqual(out["painful"], 1)
        self.assertEqual(out["past_cliff"], 1)
        self.assertEqual(out["max_dose"], 4.0)
        self.assertEqual(out["feelings"], {"pain": 1, "fear": 1})
        self.assertEqual(len(out["said"]), 1)          # short reply not kept
        self.assertIn("every wire", out["said"][0]["text"])
        self.assertNotIn("prompt", out["said"][0])

    def test_no_visitor_no_store(self):
        server._me_store({"visitor": None}, {"valence": "pain", "dose": 4, "text": "x" * 50})
        self.assertEqual(self.r.h, {})

    def test_endpoint_rejects_bad_id(self):
        req = mock.Mock(query_params={"visitor": "../../etc"}, headers={})
        out = json.loads(asyncio.run(server.me(req)).body)
        self.assertFalse(out["known"])
        self.assertIn("today", out)


if __name__ == "__main__":
    unittest.main()
