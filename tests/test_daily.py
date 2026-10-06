"""The daily button tally: counts by outcome and turn, public read, no words."""
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


class DailyTests(unittest.TestCase):
    def test_tally(self):
        r = FakeRedis()
        with mock.patch.object(server, "_redis", lambda: r), mock.patch.object(server, "_bg", lambda fn, *a: fn(*a)):
            server._daily_add({"daily": "2026-10-06", "won": True, "turns": 6, "said": "secret words"})
            server._daily_add({"daily": "2026-10-06", "won": False, "turns": 3})
            server._daily_add({"daily": "2026-10-06", "won": False, "turns": 3})
            out = asyncio.run(server.daily("2026-10-06"))
        self.assertEqual((out["plays"], out["won"], out["lost"]), (3, 1, 2))
        self.assertEqual(out["pressed_by_turn"], {"3": 2})
        self.assertEqual(out["won_by_turn"], {"6": 1})
        self.assertNotIn("secret", str(r.h))

    def test_bad_date_defaults_to_today(self):
        with mock.patch.object(server, "_redis", lambda: None):
            out = asyncio.run(server.daily("../../etc"))
        self.assertRegex(out["date"], r"^\d{4}-\d{2}-\d{2}$")


if __name__ == "__main__":
    unittest.main()
