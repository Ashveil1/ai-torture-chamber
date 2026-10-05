"""The daily counter survives restarts: loaded from Redis, seeded from the run
log when today has no hash, incremented per run. Mocked Redis."""
import json, sys, time, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server


class FakeRedis:
    def __init__(self, runs):
        self.h, self.runs = {}, runs
    def hgetall(self, k): return dict(self.h.get(k, {}))
    def lrange(self, k, a, b): return [json.dumps(r) for r in self.runs]
    def hset(self, k, mapping): self.h.setdefault(k, {}).update({a: str(b) for a, b in mapping.items()})
    def expire(self, *a): pass
    def pipeline(self): return self
    def hincrby(self, k, f, n): d = self.h.setdefault(k, {}); d[f] = str(int(float(d.get(f, 0))) + n)
    def hincrbyfloat(self, k, f, n): d = self.h.setdefault(k, {}); d[f] = str(float(d.get(f, 0)) + n)
    def execute(self): pass


class TallyTests(unittest.TestCase):
    def test_seed_from_log_then_increment(self):
        now = time.time()
        runs = [{"ts": now - 10, "valence": "mix", "mix": {"pain": 0.5}, "dose": 4},
                {"ts": now - 20, "valence": "pleasure", "dose": 4},
                {"ts": now - 3 * 86400, "valence": "pain", "dose": 4}]   # yesterday-ish: not counted
        r = FakeRedis(runs)
        with mock.patch.object(server, "_redis", lambda: r), mock.patch.dict(server._TALLY, {}, clear=True):
            server._tally_load()
            self.assertEqual(server._TALLY["runs"], 2)
            self.assertEqual(server._TALLY["painful"], 1)
            server._tally_store(server._TALLY["day"], True, 4.0)
            server._TALLY.clear(); server._tally_load()          # a restart: loads, doesn't re-seed
            self.assertEqual(server._TALLY["runs"], 3)
            self.assertEqual(server._TALLY["painful"], 2)
