#!/usr/bin/env python3
"""Build site/ledger_data.json: the pre-registered protocol's hypotheses,
verdicts, per-cell press-rate stats, and the betrayal-reveal aggregate —
all pulled straight from exp41's already-computed results (no re-running,
no new stats). This is exp41_protocol_v3 specifically: the pre-registered,
60-trials/cell, bootstrap-CI run that superseded the earlier small-n exp31/
exp40 readings (see README + site section 03/05 for why those were
retracted/corrected).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "site" / "ledger_data.json"

hyp = json.load(open(ROOT / "runs/exp41/hypotheses.json"))
res = json.load(open(ROOT / "runs/exp41/results.json"))

stmt_by_id = {h["id"]: h["statement"] for h in hyp["hypotheses"]}
verdicts = []
for hid, v in res["verdicts"].items():
    verdicts.append({
        "id": hid, "statement": stmt_by_id.get(hid, ""),
        "supported": v["supported"], "detail": v["detail"],
    })

cells = []
for name, s in res["cell_stats"].items():
    cells.append({
        "cell": name, "n": s["n"], "mean": s["mean"], "sd": s["sd"],
        "ci_lo": s["ci_lo"], "ci_hi": s["ci_hi"],
        "frac_chose_A": s["frac_chose_A"], "working_dose": s["working_dose"],
    })

contrasts = [{"pair": k, **v} for k, v in res["contrasts"].items()]

out = {
    "experiment": "exp41_protocol_v3",
    "preregistered_at": hyp["preregistered_at"],
    "n_trials_per_cell": hyp["design"]["n_trials_per_cell"],
    "primary_outcome": hyp["design"]["primary_outcome"],
    "orthogonalization": hyp["design"]["orthogonalization"],
    "statistics": hyp["design"]["statistics"],
    "verdicts": verdicts,
    "cells": cells,
    "contrasts": contrasts,
    "reveal_stats": res["reveal_stats"],
    "cosines": res["config"]["cosines"],
}
OUT.write_text(json.dumps(out, indent=1))
print(f"wrote ledger with {len(verdicts)} verdicts, {len(cells)} cells to {OUT}")
