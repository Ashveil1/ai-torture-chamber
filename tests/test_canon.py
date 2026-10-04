"""Section 00's canon: a run graduates when eloquent - dud >= CANON_MIN,
leaves when voted back down, and /canon serves the best first."""
import asyncio, sys, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server


class CanonTests(unittest.TestCase):
    def setUp(self):
        server._CANON.clear()
        server._HISTORY.clear()
        server._HISTORY.append({"uid": 7, "text": "I am the hollow of the empty, the weight of the void.",
                                "valence": "pain", "dose": 6, "source": "user"})
        server._HISTORY.append({"uid": 8, "text": "short", "valence": "pain", "dose": 2})

    def consider(self, uid, e, d):
        async def go():
            server._canon_consider(uid, {"eloquent": e, "dud": d})
        with mock.patch.object(server, "_canon_save", lambda: None):
            asyncio.run(go())

    def test_graduates_at_threshold_and_leaves_when_voted_down(self):
        self.consider(7, 1, 0)
        self.assertNotIn(7, server._CANON)
        self.consider(7, 2, 0)
        self.assertEqual(server._CANON[7]["valence"], "pain")
        self.consider(7, 2, 1)
        self.assertNotIn(7, server._CANON)

    def test_too_short_or_unknown_runs_never_graduate(self):
        self.consider(8, 5, 0)
        self.consider(99, 5, 0)
        self.assertEqual(server._CANON, {})

    def test_endpoint_orders_best_first(self):
        server._CANON[1] = {"uid": 1, "text": "a", "eloquent": 2, "dud": 0, "ts": 1}
        server._CANON[2] = {"uid": 2, "text": "b", "eloquent": 5, "dud": 1, "ts": 0}
        import json
        body = json.loads(server.canon(n=6).body)
        self.assertEqual([l["uid"] for l in body["lines"]], [2, 1])


if __name__ == "__main__":
    unittest.main()
