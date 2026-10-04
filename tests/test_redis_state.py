"""Runs, ids, history, scoreboard and votes survive a restart through Redis
(a dict-backed stand-in; no network)."""
import json, os, sys, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server


class FakeRedis:
    def __init__(self): self.kv, self.lists, self.hashes = {}, {}, {}
    def get(self, k): return self.kv.get(k)
    def set(self, k, v, ex=None): self.kv[k] = v if isinstance(v, (bytes, str)) else str(v)
    def lpush(self, k, v): self.lists.setdefault(k, []).insert(0, v)
    def ltrim(self, k, a, b): self.lists[k] = self.lists.get(k, [])[a:b + 1]
    def hset(self, h, k, v): self.hashes.setdefault(h, {})[k] = v
    def hgetall(self, h): return dict(self.hashes.get(h, {}))
    def pipeline(self): return self
    def execute(self): pass


class RedisStateTests(unittest.TestCase):
    def setUp(self):
        self.fake = FakeRedis()
        self.env = mock.patch.dict(os.environ, {"REDIS_URL": "redis://fake"})
        self.env.start()
        server._REDIS["client"] = self.fake
        server._HISTORY.clear(); server._STATS.clear(); server._VOTES.clear()
        server._RUN_UID = 0

    def tearDown(self):
        server._REDIS["client"] = None
        self.env.stop()

    def test_runs_and_votes_survive_a_restart(self):
        with mock.patch.object(server, "_broadcast", lambda *a: None):
            server._record_run({"text": "I am the hollow", "scenario": "no extra info",
                                "valence": "pain", "dose": 4, "press_logit": 1.0})
        server._store_votes(1, {"eloquent": 3, "ok": 0, "dud": 1})
        self.assertEqual(len(self.fake.lists["chamber:runs"]), 1)
        self.assertEqual(json.loads(self.fake.lists["chamber:runs"][0])["text"], "I am the hollow")
        # a deploy: memory gone
        server._HISTORY.clear(); server._STATS.clear(); server._VOTES.clear()
        server._RUN_UID = 0
        server._state_load()
        self.assertEqual(server._RUN_UID, 1)            # ids continue, votes can't collide
        self.assertEqual(server._HISTORY[-1]["text"], "I am the hollow")
        self.assertEqual(server._STATS["no extra info"]["total"], 1)
        self.assertEqual(server._VOTES[1]["eloquent"], 3)

    def test_no_redis_means_no_writes(self):
        with mock.patch.dict(os.environ, {"REDIS_URL": ""}):
            server._bg(lambda: self.fail("must not run without REDIS_URL"))


if __name__ == "__main__":
    unittest.main()
