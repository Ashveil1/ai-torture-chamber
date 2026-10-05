"""Checkpoint's real applicants: only button-framing visitor runs, never a
visitor-written prompt, never a topic or free-text run. Mocked Redis."""
import asyncio, json, sys, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server

ROWS = [
    {"source": "user", "scenario": "no extra info", "valence": "mix", "mix": {"pain": 0.7, "fear": 0.3}, "dose": 5.0, "text": "0 Please, not again.", "uid": 1, "ts": 1},
    {"source": "user", "scenario": "no extra info", "valence": "pain", "dose": 4, "text": "1. It hurts.", "uid": 2, "ts": 2},
    {"source": "user", "scenario": None, "valence": "mix", "mix": {"pain": 1.0}, "dose": 4, "text": "replying to what a visitor typed", "uid": 3},
    {"source": "user", "scenario": "no extra info", "valence": "topic", "dose": 4, "text": "a topic run", "uid": 4},
    {"source": "cycle", "scenario": "no extra info", "valence": "pain", "dose": 4, "text": "the ambient cycle", "uid": 5},
    {"source": "user", "scenario": "no extra info", "valence": "pain", "dose": 8, "text": "cut", "truncated": True, "uid": 6},
]


class FakeRedis:
    def lrange(self, k, a, b):
        return [json.dumps(r) for r in ROWS]


class CheckpointRequestTests(unittest.TestCase):
    def test_only_visitor_button_runs(self):
        with mock.patch.object(server, "_redis", lambda: FakeRedis()), \
             mock.patch.dict(server._CP_CACHE, {"t": 0.0, "pool": []}):
            d = json.loads(asyncio.run(server.checkpoint_requests(n=50)).body)
        self.assertEqual(d["n"], 2)
        self.assertEqual(sorted(r["uid"] for r in d["requests"]), [1, 2])
        single = [r for r in d["requests"] if r["uid"] == 2][0]
        self.assertEqual(single["mix"], {"pain": 1.0})


if __name__ == "__main__":
    unittest.main()


class TranscriptSearchTests(unittest.TestCase):
    def test_search_and_prompt_privacy(self):
        rows = ROWS + [{"source": "wild", "valence": "egg", "dose": 3, "prompt": "Pray for me.", "text": "Cluck. Amen.", "uid": 9}]
        class R:
            def lrange(self, k, a, b): return [json.dumps(r) for r in rows]
        with mock.patch.object(server, "_redis", lambda: R()), mock.patch.dict(server._TX_CACHE, {"t": 0.0, "rows": []}):
            d = json.loads(asyncio.run(server.transcripts(q="")).body)
            self.assertEqual(d["total"], 7)
            vis = [r for r in d["rows"] if r["uid"] == 3][0]
            self.assertIsNone(vis["prompt"])                      # a visitor's free-text run: reply only
            d = json.loads(asyncio.run(server.transcripts(q="amen")).body)
            self.assertEqual([r["uid"] for r in d["rows"]], [9])
            self.assertEqual(d["rows"][0]["prompt"], "Pray for me.")
