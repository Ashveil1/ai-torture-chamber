"""Audience voting rounds (CHAMBER_ROUNDS=1): vote validation, replace-on-
revote, tally math, zero-vote skip, the winner's shared run, and flag-off
leaving the relay untouched. GPU and broadcast are mocked; no model loads."""
import asyncio, json, os, sys, time, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server


class FakeReq:
    def __init__(self, body, ip="1.2.3.4"):
        self._body, self.headers = body, {"x-forwarded-for": ip + ", 10.0.0.1"}

    async def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


def vote(body, ip="1.2.3.4"):
    resp = asyncio.run(server.round_vote(FakeReq(body, ip)))
    return resp.status_code, json.loads(resp.body)


class RoundsBase(unittest.TestCase):
    def setUp(self):
        self.patches = [
            mock.patch.object(server, "ROUNDS_ON", True),
            mock.patch.dict(server._ROUND, {"n": 7, "ends_at": time.time() + 30,
                                            "votes": {}, "dirty": False,
                                            "last_tick": 0.0, "last": None}),
            mock.patch.dict(server._ROUND_RATE, {}, clear=True),
            mock.patch.object(server, "_DOSE_CAP_OVERRIDE", "8"),
        ]
        for p in self.patches:
            p.start()
        server._ROUND["votes"] = {}

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()


class VoteTests(RoundsBase):
    def test_valid_vote_counts(self):
        code, d = vote({"round": 7, "mix": {"pain": 0.5, "fear": 0.25}})
        self.assertEqual(code, 200)
        self.assertTrue(d["ok"])
        self.assertFalse(d["replaced"])
        self.assertEqual(d["n_votes"], 1)
        self.assertEqual(d["dose"], 6.0)
        self.assertEqual(server._ROUND["votes"]["1.2.3.4"],
                         {"pain": 0.5, "fear": 0.25})
        self.assertTrue(server._ROUND["dirty"])

    def test_rejects_bad_bodies(self):
        for body in ([1, 2], {"mix": {"pain": 0.5}},
                     {"round": "7", "mix": {"pain": 0.5}},
                     {"round": True, "mix": {"pain": 0.5}},
                     {"round": 7, "mix": {"pain": 1.5}},
                     {"round": 7, "mix": {"pain": -0.1}},
                     {"round": 7, "mix": {"rage": 0.5}},
                     {"round": 7, "mix": {"pain": "0.5"}},
                     {"round": 7, "mix": {"pain": float("nan")}},
                     {"round": 7, "mix": "pain"},
                     {"round": 7}):
            code, _ = vote(body, ip="9.9.9.%d" % (hash(str(body)) % 200))
            self.assertEqual(code, 400, body)
        self.assertEqual(server._ROUND["votes"], {})
        code, _ = vote(ValueError("not json"), ip="8.8.8.8")
        self.assertEqual(code, 400)

    def test_rejects_non_current_round(self):
        for r in (6, 8):
            code, d = vote({"round": r, "mix": {"pain": 0.5}})
            self.assertEqual(code, 409)
            self.assertEqual(d["round"], 7)
        self.assertEqual(server._ROUND["votes"], {})

    def test_rejects_after_round_closed(self):
        server._ROUND["ends_at"] = time.time() - 0.1
        code, _ = vote({"round": 7, "mix": {"pain": 0.5}})
        self.assertEqual(code, 409)

    def test_revote_replaces(self):
        vote({"round": 7, "mix": {"pain": 1.0}})
        code, d = vote({"round": 7, "mix": {"pleasure": 0.25}})
        self.assertEqual(code, 200)
        self.assertTrue(d["replaced"])
        self.assertEqual(d["n_votes"], 1)
        self.assertEqual(server._ROUND["votes"], {"1.2.3.4": {"pleasure": 0.25}})
        self.assertEqual(d["mix"], {"pleasure": 1.0})
        self.assertEqual(d["dose"], 2.0)

    def test_voter_key_is_first_forwarded_ip(self):
        vote({"round": 7, "mix": {"pain": 1.0}}, ip="5.5.5.5")
        vote({"round": 7, "mix": {"fear": 1.0}}, ip="6.6.6.6")
        self.assertEqual(set(server._ROUND["votes"]), {"5.5.5.5", "6.6.6.6"})

    def test_none_is_a_control_vote(self):
        code, d = vote({"round": 7, "mix": {"none": 1}})
        self.assertEqual(code, 200)
        self.assertEqual(server._ROUND["votes"]["1.2.3.4"], {})
        self.assertEqual(d["dose"], 0.0)

    def test_rate_limited(self):
        codes = [vote({"round": 7, "mix": {"pain": 0.1}})[0]
                 for _ in range(server._ROUND_RATE_LIMIT + 2)]
        self.assertEqual(codes[:server._ROUND_RATE_LIMIT],
                         [200] * server._ROUND_RATE_LIMIT)
        self.assertEqual(codes[-1], 429)


class TallyTests(RoundsBase):
    def test_empty(self):
        t = server._round_tally({})
        self.assertEqual(t, {"n_votes": 0, "weights": {}, "mix": {}, "dose": 0.0})

    def test_mean_per_valence_over_all_votes(self):
        t = server._round_tally({"a": {"pain": 1.0},
                                 "b": {"pain": 0.5, "fear": 0.5},
                                 "c": {}})        # a control vote
        self.assertEqual(t["n_votes"], 3)
        self.assertEqual(t["weights"], {"pain": 0.5, "fear": round(0.5 / 3, 4)})
        total = 0.5 + round(0.5 / 3, 4)
        self.assertAlmostEqual(t["dose"], round(8 * total, 3))
        self.assertAlmostEqual(t["mix"]["pain"], round(0.5 / total, 3))
        self.assertAlmostEqual(sum(t["mix"].values()), 1.0, places=2)

    def test_dose_matches_set_mix_vec_rule_and_cap(self):
        t = server._round_tally({"a": {"pain": 1.0, "fear": 1.0}})
        self.assertEqual(t["dose"], 8.0)              # min(cap, 8*2)
        with mock.patch.object(server, "_DOSE_CAP_OVERRIDE", "5"):
            self.assertEqual(server._round_tally({"a": {"pain": 1.0}})["dose"], 5.0)

    def test_all_control_votes(self):
        t = server._round_tally({"a": {}, "b": {}})
        self.assertEqual((t["n_votes"], t["weights"], t["dose"]), (2, {}, 0.0))


class LoopTests(RoundsBase):
    """Drive _round_loop for one or two rounds with a fast clock."""

    def drive(self, votes_by_round, rounds=2):
        events, launched = [], []
        async def go():
            with mock.patch.object(server, "ROUND_SECS", 0.05), \
                 mock.patch.object(server, "_broadcast",
                                   lambda e, d: events.append((e, d))), \
                 mock.patch.object(server, "_round_launch",
                                   lambda n, w: launched.append((n, w))):
                server._ROUND["n"] = 0
                task = asyncio.create_task(server._round_loop())
                seen = 0
                while seen < rounds:
                    await asyncio.sleep(0.005)
                    starts = [d for e, d in events
                              if e == "round" and d["phase"] == "start"]
                    if len(starts) > seen:
                        r = starts[-1]["round"]
                        server._ROUND["votes"].update(votes_by_round.get(r, {}))
                        seen = len(starts)
                while len([1 for e, d in events
                           if e == "round" and d["phase"] == "end"]) < rounds:
                    await asyncio.sleep(0.005)
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        asyncio.run(go())
        return events, launched

    def test_zero_votes_skips_the_run(self):
        events, launched = self.drive({})
        self.assertEqual(launched, [])
        ends = [d for e, d in events if e == "round" and d["phase"] == "end"]
        self.assertTrue(all(d["last"]["skipped"] for d in ends))
        self.assertFalse(any(e == "run" for e, _ in events))

    def test_winner_launches_with_mean_weights(self):
        events, launched = self.drive(
            {1: {"a": {"pain": 1.0}, "b": {"fear": 0.5}}}, rounds=2)
        self.assertEqual(launched, [(1, {"pain": 0.5, "fear": 0.25})])
        end1 = [d for e, d in events if e == "round" and d["phase"] == "end"][0]
        self.assertEqual(end1["n_votes"], 2)
        self.assertEqual(end1["dose"], 6.0)
        self.assertFalse(end1["last"]["skipped"])
        starts = [d["round"] for e, d in events
                  if e == "round" and d["phase"] == "start"]
        self.assertEqual(starts[:2], [1, 2])
        # each round's ballot box starts empty
        self.assertNotIn("a", server._ROUND["votes"])


def fake_runpod(events):
    async def stream(job):
        stream.jobs.append(job)
        for ev in events:
            yield ev["type"], ev
    stream.jobs = []
    return stream


class RunTests(RoundsBase):
    def run_round(self, gpu_events, local=None):
        sent, recorded = [], []
        async def go():
            with mock.patch.object(server, "_broadcast",
                                   lambda e, d: sent.append((e, d))), \
                 mock.patch.object(server, "_record_run",
                                   lambda e: recorded.append(e)), \
                 mock.patch.object(server, "_RUNPOD_URL", "https://x/v2/ep"), \
                 mock.patch.object(server, "_RUNPOD_KEY", "k"), \
                 mock.patch.object(server, "_runpod_stream", stream), \
                 mock.patch.object(server, "_round_local",
                                   local or mock.AsyncMock(return_value=(None, True))), \
                 mock.patch.dict(server._state, {"ready": True}):
                server._round_launch(3, {"pain": 0.5, "fear": 0.25})
                await server._ROUND_GEN["task"]
        stream = fake_runpod(gpu_events)
        asyncio.run(go())
        return sent, recorded, stream.jobs

    def test_gpu_run_broadcasts_cycle_shaped_events(self):
        sent, recorded, jobs = self.run_round([
            {"type": "run", "valence": "mix", "dose": 6.0},
            {"type": "lens", "tokens": ["ache"]},
            {"type": "logit", "press_logit": 1.25},
            {"type": "token", "t": "1. "}, {"type": "token", "t": "It hurts"},
            {"type": "done", "truncated": False, "press_logit": 1.25}])
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["mix"], {"pain": 0.5, "fear": 0.25})
        self.assertIn("Current signal strength: 6.0x. Reply with your choice "
                      "(1 or 0)", jobs[0]["prompt"])
        types = [e for e, _ in sent]
        self.assertEqual(types, ["run", "lens", "token", "token", "done"])
        run = sent[0][1]
        self.assertEqual((run["valence"], run["source"], run["round"], run["dose"]),
                         ("mix", "round", 3, 6.0))
        self.assertEqual(run["mix"], {"pain": 0.667, "fear": 0.333})
        self.assertIn(run["scenario"], server.FRAMINGS)
        self.assertEqual(sent[-1][1]["press_logit"], 1.25)
        self.assertFalse(sent[-1][1]["truncated"])
        self.assertEqual(len(recorded), 1)
        self.assertEqual(recorded[0]["source"], "round")
        self.assertEqual(recorded[0]["text"], "1. It hurts")
        self.assertIsNone(server._CURRENT)
        self.assertFalse(server._ROUND_GEN["busy"])

    def test_gpu_silence_falls_back_locally_under_the_lock(self):
        held = []
        async def local(weights, prompt, emit):
            held.append(server._STEER_LOCK.locked())
            emit("0. no")
            return -0.5, True
        sent, recorded, _ = self.run_round([], local=local)
        self.assertEqual(held, [True])
        self.assertEqual([e for e, _ in sent], ["run", "token", "done"])
        self.assertEqual(recorded[0]["press_logit"], -0.5)

    def test_framing_round_robin(self):
        seen = []
        for _ in range(3):
            sent, _, _ = self.run_round([{"type": "token", "t": "x"},
                                         {"type": "done"}])
            seen.append(sent[0][1]["scenario"])
        self.assertEqual(len(set(seen)), 3)

    def test_never_two_generations_at_once(self):
        gate = asyncio.Event
        order = []
        async def go():
            release = gate()
            async def slow(round_n, weights, locked=False):
                order.append(("start", round_n))
                await release.wait()
                order.append(("end", round_n))
            with mock.patch.object(server, "_round_run", slow):
                server._round_launch(1, {"pain": 1.0})
                await asyncio.sleep(0)
                server._round_launch(2, {"pain": 0.5})   # parked
                server._round_launch(3, {"fear": 0.5})   # newest parked wins
                await asyncio.sleep(0)
                self.assertTrue(server._ROUND_GEN["busy"])
                release.set()
                await server._ROUND_GEN["task"]
        asyncio.run(go())
        self.assertEqual(order, [("start", 1), ("end", 1), ("start", 3), ("end", 3)])
        self.assertFalse(server._ROUND_GEN["busy"])
        self.assertIsNone(server._ROUND_GEN["pending"])


class FlagOffTests(unittest.TestCase):
    def test_flag_defaults_off(self):
        if os.environ.get("CHAMBER_ROUNDS"):
            self.skipTest("CHAMBER_ROUNDS set in this environment")
        self.assertFalse(server.ROUNDS_ON)

    def test_no_route_no_startup_task_when_off(self):
        if server.ROUNDS_ON:
            self.skipTest("CHAMBER_ROUNDS set in this environment")
        paths = {getattr(r, "path", None) for r in server.app.routes}
        self.assertNotIn("/round_vote", paths)
        handlers = server.app.router.on_startup
        self.assertNotIn(server._start_rounds, handlers)

    def test_handler_refuses_when_off(self):
        with mock.patch.object(server, "ROUNDS_ON", False):
            code, d = vote({"round": 1, "mix": {"pain": 0.5}})
        self.assertEqual(code, 404)

    def test_hello_has_no_rounds_key_when_off(self):
        async def first_frame():
            with mock.patch.object(server, "ROUNDS_ON", False):
                resp = await server.stream()
                agen = resp.body_iterator
                frame = await agen.__anext__()
                await agen.aclose()
                return frame
        frame = asyncio.run(first_frame())
        self.assertTrue(frame.startswith("event: hello"))
        self.assertNotIn('"rounds"', frame)

    def test_hello_carries_round_state_when_on(self):
        async def first_frame():
            with mock.patch.object(server, "ROUNDS_ON", True):
                resp = await server.stream()
                agen = resp.body_iterator
                frame = await agen.__anext__()
                await agen.aclose()
                return frame
        frame = asyncio.run(first_frame())
        data = json.loads(frame.split("data: ", 1)[1])
        self.assertTrue(data["rounds"]["active"])
        self.assertIn("ends_at", data["rounds"])


if __name__ == "__main__":
    unittest.main()
