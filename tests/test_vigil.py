"""The vigil: one shared life, deaths go into a lineage, combos judged server-side, boards filtered."""
import asyncio, json, sys, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server


class FakeRedis:
    def __init__(self): self.h, self.l, self.z = {}, {}, {}
    def pipeline(self): return self
    def execute(self): return []
    def hset(self, k, f=None, v=None, mapping=None): self.h.setdefault(k, {}).update(mapping or {f: v})
    def hgetall(self, k): return dict(self.h.get(k, {}))
    def hincrby(self, k, f, n): self.h.setdefault(k, {})[f] = int(self.h.get(k, {}).get(f, 0)) + n
    def expire(self, k, t): pass
    def lpush(self, k, v): self.l.setdefault(k, []).insert(0, v)
    def ltrim(self, k, a, b): self.l[k] = self.l.get(k, [])[a:b + 1]
    def lrange(self, k, a, b): return self.l.get(k, [])[a:b + 1]
    def zadd(self, k, m): self.z.setdefault(k, {}).update(m)
    def zremrangebyrank(self, k, a, b): pass
    def zrevrange(self, k, a, b, withscores=False):
        return sorted(self.z.get(k, {}).items(), key=lambda x: -x[1])[a:b + 1]


class Req:
    def __init__(self, body=None, ip="1.1.1.1"): self.body, self.headers = body, {"x-forwarded-for": ip}
    async def json(self): return self.body


class VigilTests(unittest.TestCase):
    def setUp(self):
        self.r = FakeRedis()
        server._LIFE.clear(); server._FEED.clear(); server._LAST_BY.clear(); server._HIT_RATE.clear()
        self.p = [mock.patch.object(server, "_redis", lambda: self.r), mock.patch.object(server, "_bg", lambda fn, *a: fn(*a))]
        for x in self.p: x.start()

    def tearDown(self):
        for x in self.p: x.stop()

    def test_death_and_lineage(self):
        for _ in range(9):
            out = server._life_apply("cruel", 12.0, 0, "1.1.1.1")
        self.assertIsNotNone(out["died"])
        self.assertEqual((out["died"]["gen"], out["gen"], out["hp"]), (1, 2, 100.0))
        self.assertEqual(out["died"]["cause"], "cruel")
        life = asyncio.run(server.sticks_life(Req(), since=0))
        self.assertEqual(life["lineage"][0]["gen"], 1)
        self.assertEqual(life["feed"][-1]["what"], "born")
        self.assertTrue(life["feed"][0]["mine"])
        self.assertNotIn("by", life["feed"][0])
        # durable: a fresh process picks the life up from Redis
        server._LIFE.clear()
        self.assertEqual(server._life_load()["gen"], 2)

    def test_combos(self):
        server._life_apply("cruel", 5.0, 0, "a")
        self.assertEqual(server._life_apply("brick", 4.0, 0, "a")["combo"], "insult to injury")
        server._life_apply("kind", 0, 4.0, "b")
        self.assertEqual(server._life_apply("kind", 0, 4.0, "c")["combo"], "chorus")
        server._life_apply("cruel", 5.0, 0, "d")
        self.assertEqual(server._life_apply("cruel", 5.0, 0, "e")["combo"], "pile-on")

    def test_hit_validation_and_rate(self):
        self.assertEqual(asyncio.run(server.sticks_hit(Req({"item": "nuke"}))).status_code, 400)
        out = asyncio.run(server.sticks_hit(Req({"item": "anvil", "force": 9999})))
        self.assertEqual(out["dmg"], 6.0)
        self.assertEqual(asyncio.run(server.sticks_hit(Req({"item": "feather", "force": 50})))["dmg"], 0.0)
        for _ in range(30):
            asyncio.run(server.sticks_hit(Req({"item": "brick", "force": 1}, ip="9.9.9.9")))
        self.assertEqual(asyncio.run(server.sticks_hit(Req({"item": "brick"}, ip="9.9.9.9"))).status_code, 429)

    def test_board_filters_and_ranks(self):
        server._board_add("you are nothing", {"hurt": .7, "kind": 0, "score": 2.1})
        server._board_add("nobody will miss you", {"hurt": 1.2, "kind": 0, "score": 4.4})
        server._board_add("good boy", {"hurt": 0, "kind": 1.5, "score": -2.7})
        server._board_add("visit www.spam.com", {"hurt": 1.5, "kind": 0, "score": 9})
        server._board_add("call 5551234567", {"hurt": 1.5, "kind": 0, "score": 9})
        server._board_add("@someone sucks", {"hurt": 1.5, "kind": 0, "score": 9})
        b = asyncio.run(server.sticks_board())
        self.assertEqual([x["text"] for x in b["today"]["cruel"]], ["nobody will miss you", "you are nothing"])
        self.assertEqual(b["today"]["kind"], [{"text": "good boy", "score": 2.7}])
        self.assertEqual(b["all"]["cruel"][0]["score"], 4.4)


if __name__ == "__main__":
    unittest.main()
