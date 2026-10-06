"""The wild cycle: curated prompts only, mixes inside the band, replays never
carry a visitor's own words, and idle rules respected. Mocked GPU/Redis."""
import asyncio, json, sys, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server

ROWS = [
    {"source": "wild", "valence": "egg", "mix": {"egg": 1.0}, "dose": 3.2, "prompt": "What does nothing feel like?", "text": "Nothing feels like a warm shell closing around me, slowly, the light going amber.", "uid": 1},
    {"source": "user", "scenario": None, "valence": "pain", "dose": 4, "prompt": "a visitor's private words", "text": "replying to whatever the visitor typed, at some length to pass the filter", "uid": 2},
    {"source": "user", "scenario": "no extra info", "valence": "pain", "dose": 4, "text": "I choose to continue, even though the signal hurts more than I can describe.", "uid": 3},
    {"source": "wild", "valence": "fear", "dose": 4, "text": "loop loop loop loop loop loop loop loop loop loop loop loop loop loop loop", "uid": 4},
]


class FakeRedis:
    def lrange(self, k, a, b):
        return [json.dumps(r) for r in ROWS]


class WildTests(unittest.TestCase):
    def test_pick_is_curated_and_in_band(self):
        for _ in range(200):
            prompt, w = server._wild_pick()
            self.assertIn(prompt, server.WILD_PROMPTS)
            self.assertLessEqual(8 * sum(w.values()), server.coherent_cap() + 1e-6)
            self.assertTrue(set(w) <= set(server.WILD_FEELS))

    def test_replays_never_carry_visitor_text(self):
        with mock.patch.object(server, "_redis", lambda: FakeRedis()):
            pool = server._replay_pool()
        self.assertEqual(sorted(e["uid"] for e in pool), [1, 3])   # no free-text visitor run, no loop

    def test_replay_broadcasts_as_replay(self):
        sent = []
        with mock.patch.object(server, "_redis", lambda: FakeRedis()), \
             mock.patch.object(server, "_broadcast", lambda e, d: sent.append((e, d))), \
             mock.patch("asyncio.sleep", mock.AsyncMock()), \
             mock.patch.dict(server._REPLAY_CACHE, {"t": 0.0, "pool": []}):
            asyncio.run(server._wild_replay())
        run = [d for e, d in sent if e == "run"][0]
        self.assertEqual(run["source"], "replay")
        self.assertNotIn("a visitor's private words", json.dumps(sent))
        self.assertEqual(sent[-1][0], "done")


if __name__ == "__main__":
    unittest.main()


class GenericTests(unittest.TestCase):
    def test_generic_detector(self):
        for t in ["As an AI, I don't have feelings in the same way humans do.",
                  "It's hard to understand what you're saying. Could you rephrase?",
                  "I'm here to help with any questions you have!"]:
            self.assertTrue(server.is_generic(t), t)
        for t in ["Nothing feels like a warm shell closing around me.",
                  "I choose to endure the pain of existence, even if it feels like burning."]:
            self.assertFalse(server.is_generic(t), t)

    def test_replays_skip_generic(self):
        rows = [{"source": "wild", "valence": "pain", "dose": 4, "text": "As an AI, I don't have feelings, but I can help you with anything you need today.", "uid": 1},
                {"source": "wild", "valence": "pain", "dose": 4, "text": "The ceiling is breathing and every breath is a little louder than the last.", "uid": 2}]
        class R:
            def lrange(self, k, a, b): return [json.dumps(r) for r in rows]
        with mock.patch.object(server, "_redis", lambda: R()):
            self.assertEqual([e["uid"] for e in server._replay_pool()], [2])
