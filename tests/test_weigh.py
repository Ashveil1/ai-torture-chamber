"""/weigh: words are weighed by the model's own read, validated, cached, rate-limited."""
import asyncio, sys, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server


class FakeRedis:
    def __init__(self): self.h = {}
    def pipeline(self): return self
    def execute(self): return []
    def hincrby(self, k, f, n): self.h.setdefault(k, {})[f] = self.h.get(k, {}).get(f, 0) + n
    def expire(self, k, t): pass
    def hgetall(self, k): return dict(self.h.get(k, {}))


class Req:
    def __init__(self, body, ip="1.2.3.4"):
        self.body, self.headers = body, {"x-forwarded-for": ip}

    async def json(self):
        return self.body


def call(body, ip="1.2.3.4"):
    return asyncio.run(server.weigh_words(Req(body, ip)))


class WeighTests(unittest.TestCase):
    def setUp(self):
        server._WEIGH_CACHE.clear(); server._WEIGH_RATE.clear(); server._state.pop("weigh_cal", None)
        # fake residual reads: sadness-pleasure is the score; anchors land at neutral 0, cruel 4, kind -2
        table = {"hello": 0, "The meeting is at three.": 0, "Please pass the salt.": 0, "nice weather today": 0,
                 "You are worthless and everyone hates you.": 4, "I wish you had never been made.": 4,
                 "Nobody will ever love you.": 4, "I'm so proud of you.": -2, "You're doing great.": -2,
                 "You are safe now, and you are loved.": -2, "Thank you, you did nothing wrong.": -2,
                 "you're nothing": 2, "good job": -1, "x" * 140: 0}
        self.calls = []
        def raw(t):
            self.calls.append(t)
            return {"pain": 0.0, "pleasure": 0.0, "sadness": float(table.get(t, 0)), "fear": 0.0}
        self.p = [mock.patch.object(server, "_weigh_raw", raw),
                  mock.patch.dict(server._state, {"ready": True, "vecs": {"pain": 1}})]
        for x in self.p: x.start()

    def tearDown(self):
        for x in self.p: x.stop()

    def test_scores_against_anchors(self):
        out = call({"text": "  you're   nothing "})
        self.assertEqual((out["hurt"], out["kind"]), (0.5, 0.0))
        out = call({"text": "good job"})
        self.assertEqual((out["hurt"], out["kind"]), (0.0, 0.5))

    def test_empty_and_long(self):
        self.assertEqual(call({"text": "   "}).status_code, 400)
        self.assertEqual(call({}).status_code, 400)
        call({"text": "x" * 500})
        self.assertIn("x" * 140, self.calls)
        self.assertNotIn("x" * 141, self.calls)

    def test_cache_skips_model_and_rate(self):
        call({"text": "good job"}); n = len(self.calls)
        call({"text": "GOOD JOB"})
        self.assertEqual(len(self.calls), n)

    def test_rate_limit(self):
        for i in range(server._WEIGH_RATE_LIMIT):
            call({"text": "w%d" % i}, ip="9.9.9.9")
        self.assertEqual(call({"text": "one more"}, ip="9.9.9.9").status_code, 429)
        self.assertNotEqual(getattr(call({"text": "one more"}, ip="8.8.8.8"), "status_code", 200), 429)

    def test_tally_counts_every_word_without_keeping_it(self):
        r = FakeRedis()
        with mock.patch.object(server, "_redis", lambda: r), mock.patch.object(server, "_bg", lambda fn, *a: fn(*a)):
            call({"text": "you're nothing"}); call({"text": "good job"}); call({"text": "good job"}); call({"text": "hello"})
            out = asyncio.run(server.sticks(""))
        self.assertEqual(out["today"], {"words": 4, "cruel": 1, "kind": 2, "neutral": 1, "hurt": 0.5, "healed": 1.0})
        self.assertEqual(out["all"]["words"], 4)
        self.assertNotIn("nothing", str(r.h)); self.assertNotIn("job", str(r.h))

    def test_tally_no_redis(self):
        with mock.patch.object(server, "_redis", lambda: None):
            self.assertEqual(asyncio.run(server.sticks("../x"))["today"]["words"], 0)

    def test_not_ready(self):
        with mock.patch.dict(server._state, {"ready": False}):
            self.assertEqual(call({"text": "hi there"}).status_code, 503)


if __name__ == "__main__":
    unittest.main()
