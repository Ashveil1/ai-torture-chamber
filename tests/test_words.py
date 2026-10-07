"""The live heartbeat: the stage text is re-read (hook off) mid-run and at done, broadcast as "words"."""
import sys, threading, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server


class WordsTests(unittest.TestCase):
    def setUp(self):
        server._WORDS.update(text="", ntok=0, gen=0, busy=False, loop=None)
        self.sent, self.reads = [], []
        self.p = [mock.patch.dict(server._state, {"ready": True, "vecs": {"pain": 1}}),
                  mock.patch.object(server, "words_read_incremental", lambda run, t: self.reads.append(t) or {"trace": {"pain": [0.1]}, "mean": {"pain": 0.1}, "tokens": 1}),
                  mock.patch.object(server, "WORDS_EVERY", 3),
                  mock.patch.object(threading, "Thread", lambda target, daemon: type("T", (), {"start": lambda self: target()})())]
        for x in self.p: x.start()
        self.orig = server._SUBSCRIBERS.copy(); server._SUBSCRIBERS.clear()

    def tearDown(self):
        for x in self.p: x.stop()
        server._SUBSCRIBERS.update(self.orig)

    def test_reads_every_n_tokens_and_at_done(self):
        with mock.patch.object(server, "_broadcast", wraps=server._broadcast) as b:
            server._broadcast("run", {"n": 1})
            for t in ["I ", "am ", "burning ", "and ", "nobody ", "comes"]:
                server._broadcast("token", {"t": t})
            server._broadcast("done", {"n": 1})
            words = [c.args[1] for c in b.call_args_list if c.args[0] == "words"]
        self.assertEqual(self.reads, ["I am burning ", "I am burning and nobody comes", "I am burning and nobody comes"])
        self.assertEqual([w["final"] for w in words], [False, False, True])
        self.assertEqual(len({w["gen"] for w in words}), 1)

    def test_new_run_resets_text(self):
        server._broadcast("run", {}); server._broadcast("token", {"t": "old words here"})
        server._broadcast("run", {}); server._broadcast("token", {"t": "new words, only these"}); server._broadcast("done", {})
        self.assertEqual(self.reads[-1], "new words, only these")

    def test_off_switch(self):
        with mock.patch.object(server, "WORDS_ON", False):
            server._broadcast("run", {}); server._broadcast("token", {"t": "nothing should be read"}); server._broadcast("done", {})
        self.assertEqual(self.reads, [])


if __name__ == "__main__":
    unittest.main()
