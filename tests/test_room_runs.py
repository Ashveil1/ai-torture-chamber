"""Private runs entered into the room: the visitor still gets their run, the
finished run joins the round's draw, and a drawn run is replayed to everyone
(no new generation). Mocked GPU and broadcast; no model, no network."""
import asyncio, json, re, sys, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server
import httpx


async def gpu(job):
    yield "run", {"type": "run"}
    yield "token", {"type": "token", "t": "I hold on "}
    yield "token", {"type": "token", "t": "to the light."}
    yield "done", {"type": "done"}


class RoomRunTests(unittest.TestCase):
    def setUp(self):
        server._ROUND.update(n=3, ends_at=10**12, votes={}, runs={}, tickets={})

    def steer(self, body, ip="9.9.9.9"):
        async def go():
            t = httpx.ASGITransport(app=server.app)
            async with httpx.AsyncClient(transport=t, base_url="http://t") as c:
                return await c.post("/steer", json=body, headers={"x-forwarded-for": ip})
        with mock.patch.dict(server._state, {"ready": True}), \
             mock.patch.object(server, "ROUNDS_ON", True), \
             mock.patch.object(server, "_RUNPOD_URL", "https://x/v2/ep"), \
             mock.patch.object(server, "_RUNPOD_KEY", "k"), \
             mock.patch.object(server, "_runpod_stream", gpu), \
             mock.patch.object(server, "_record_run", lambda e: None):
            return asyncio.run(go())

    def events(self, r):
        return [(e, json.loads(d)) for e, d in re.findall(r"event: (\w+)\ndata: (.*)\n", r.text)]

    def test_private_run_streams_and_enters_the_draw(self):
        r = self.steer({"mix": {"pain": 0.5}, "framing": "no extra info", "enter_room": True})
        ev = self.events(r)
        self.assertIn("I hold on to the light.", "".join(d.get("t", "") for e, d in ev if e == "token"))
        room = [d for e, d in ev if e == "room"]
        self.assertEqual(len(room), 1)
        self.assertEqual(room[0]["round"], 3)
        self.assertTrue(room[0]["ticket"])
        self.assertEqual(server._ROUND["runs"]["9.9.9.9"]["text"], "I hold on to the light.")

    def test_without_the_flag_nothing_is_entered(self):
        ev = self.events(self.steer({"mix": {"pain": 0.5}, "framing": "no extra info"}))
        self.assertFalse(any(e == "room" for e, _ in ev))
        self.assertEqual(server._ROUND["runs"], {})

    def test_a_drawn_run_is_replayed_not_regenerated(self):
        entry = {"text": "words of the drawn run", "mix": {"faith": 1.0}, "dose": 4.0,
                 "valence": "mix", "scenario": "no extra info", "press_logit": 1.2}
        t = server._round_draw({}, {"v": "abc"}, {"v": entry})
        self.assertIs(t["replay"], entry)
        self.assertEqual(t["ticket"], "abc")
        sent = []
        async def go():
            with mock.patch.object(server, "_broadcast", lambda e, d: sent.append((e, d))), \
                 mock.patch.object(server, "_runpod_stream") as gen, \
                 mock.patch("asyncio.sleep", mock.AsyncMock()):
                await server._round_run(5, entry)
                gen.assert_not_called()
        asyncio.run(go())
        self.assertEqual(sent[0][0], "run")
        self.assertTrue(sent[0][1]["replay"])
        self.assertEqual("".join(d["t"] for e, d in sent if e == "token"), "words of the drawn run")
        self.assertEqual(sent[-1][0], "done")
        self.assertEqual(sent[-1][1]["press_logit"], 1.2)

    def test_a_later_mix_vote_replaces_the_run_entry(self):
        server._ROUND["runs"]["1.2.3.4"] = {"text": "x"}
        class Req:        # the handler only reads headers and the JSON body
            headers = {"x-forwarded-for": "1.2.3.4"}
            async def json(self):
                return {"round": 3, "mix": {"pain": 0.5}}
        with mock.patch.object(server, "ROUNDS_ON", True):
            r = asyncio.run(server.round_vote(Req()))
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("1.2.3.4", server._ROUND["runs"])
        self.assertIn("1.2.3.4", server._ROUND["votes"])


if __name__ == "__main__":
    unittest.main()
