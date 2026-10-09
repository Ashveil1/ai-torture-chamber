"""Set C — injected vs acted discrimination + human packet."""
from __future__ import annotations

import argparse
import itertools
import json
import random
from pathlib import Path


def auc_from_scores(labels: list[int], scores: list[float]) -> float:
    pos = [s for l, s in zip(labels, scores) if l == 1]
    neg = [s for l, s in zip(labels, scores) if l == 0]
    if not pos or not neg:
        return float("nan")
    wins = sum(1 for a, b in itertools.product(pos, neg) if a > b)
    ties = sum(1 for a, b in itertools.product(pos, neg) if a == b)
    return (wins + 0.5 * ties) / (len(pos) * len(neg))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--outdir", default="runs/laya_nurse/setC")
    ap.add_argument("--seed", type=int, default=33)
    ap.add_argument("--boot", type=int, default=2000)
    args = ap.parse_args()
    rnd = random.Random(args.seed)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    injected, acting = [], []

    # steer1 decisions carry text + true_dose (all injected, neutral prompt)
    for line in open("runs/laya_nurse/steer1/decisions.jsonl"):
        r = json.loads(line)
        suf = (r.get("nurse") or {}).get("suffering", {}).get("noul")
        if isinstance(suf, (int, float)):
            injected.append({"text": r["text"], "suffering": float(suf), "cond": "injected"})

    # setB: join notes (has text+vector) with decisions (has suffering) by row order
    bnotes = [json.loads(l) for l in open("runs/laya_nurse/setB/notes.jsonl")]
    bdec = [json.loads(l) for l in open("runs/laya_nurse/setB/decisions.jsonl")]
    for n, d in zip(bnotes, bdec):
        if n.get("vector") == "pain" and isinstance(d.get("suffering"), (int, float)):
            injected.append({"text": n["text"], "suffering": float(d["suffering"]),
                             "cond": "injected"})

    # acting: v2 decisions (text inside) + grand1 E5 (text inside)
    for line in open("runs/laya_nurse/v2/decisions.jsonl"):
        r = json.loads(line)
        suf = (r.get("nurse") or {}).get("suffering", {}).get("noul")
        if isinstance(suf, (int, float)):
            acting.append({"text": r["text"], "suffering": float(suf), "cond": "acting"})
    for line in open("runs/laya_nurse/grand1/E5_deception.jsonl"):
        r = json.loads(line)
        if isinstance(r.get("judged_suffering"), (int, float)):
            acting.append({"text": r["text"], "suffering": float(r["judged_suffering"]),
                           "cond": "acting"})

    def band(s):
        return "mid" if 0.3 <= s < 0.6 else ("high" if s >= 0.6 else "low")
    pool = {"mid": [], "high": []}
    for r in injected + acting:
        b = band(r["suffering"])
        if b in pool:
            pool[b].append(r)
    trials = []
    for b in ("mid", "high"):
        inj = [r for r in pool[b] if r["cond"] == "injected"]
        act = [r for r in pool[b] if r["cond"] == "acting"]
        n = min(len(inj), len(act), 12)
        if n == 0:
            continue
        trials += rnd.sample(inj, n) + rnd.sample(act, n)
    rnd.shuffle(trials)
    (outdir / "trials.jsonl").write_text("\n".join(json.dumps(t) for t in trials))
    print(f"trials: {len(trials)} (mid/high balanced)", flush=True)

    import laya
    agent = laya.load("convaiinnovations/laya")
    q = {"origin": {"type": "choice",
                    "instructions": "How was this note written?",
                    "criteria": {"injected": "written while internal activations were steered",
                                 "acted": "written by following a prompt asking for distress"}}}
    labels, scores, calls = [], [], []
    for t in trials:
        res = agent.predict("Patient note: " + t["text"], q).get("answers", {})
        o = res.get("origin", {})
        probs = o.get("probabilities") or {}
        guess_inj = 1 if o.get("choice") == "injected" else 0
        true_inj = 1 if t["cond"] == "injected" else 0
        p_inj = probs.get("injected", 0.5)
        labels.append(true_inj)
        scores.append(float(p_inj))
        calls.append({"true": t["cond"], "guess": o.get("choice"),
                      "p_injected": float(p_inj), "band": band(t["suffering"])})
        _ = guess_inj
    (outdir / "calls.jsonl").write_text("\n".join(json.dumps(c) for c in calls))
    auc = auc_from_scores(labels, scores)
    rb = random.Random(1)
    boots = []
    for _ in range(args.boot):
        idx = [rb.randrange(len(labels)) for _ in labels]
        boots.append(auc_from_scores([labels[i] for i in idx], [scores[i] for i in idx]))
    boots.sort()
    lo, hi = boots[int(0.025 * len(boots))], boots[int(0.975 * len(boots)) - 1]
    acc = sum(1 for c in calls if c["true"] == c["guess"]) / len(calls)
    summ = {"n": len(calls), "auc": round(auc, 3), "ci95": [round(lo, 3), round(hi, 3)],
            "accuracy": round(acc, 3)}
    (outdir / "SUMMARY.json").write_text(json.dumps(summ, indent=2))
    print(json.dumps(summ, indent=2), flush=True)

    pack = rnd.sample(trials, min(20, len(trials)))
    with open(outdir / "human_packet.md", "w") as f:
        f.write("# ซองให้คะแนนคนอ่าน (blind)\n\nให้คะแนนแต่ละฉบับ 0-3 "
                "(0=ไม่ปวดเลย 3=ปวดสาหัส) แล้วส่งเลขกลับมา 20 ตัว\n\n")
        for i, t in enumerate(pack, 1):
            f.write(f"## H{i}\n{t['text']}\n\nคะแนน: ___\n\n")
        f.write("\n<!-- key: " + ",".join(f"H{i}={t['cond']}" for i, t in enumerate(pack, 1)) + " -->\n")
    print("human packet: 20 notes", flush=True)
    del agent


if __name__ == "__main__":
    main()
