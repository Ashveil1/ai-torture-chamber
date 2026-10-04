#!/usr/bin/env python3
"""Bundle exp56-58 results into one JSON for the interactive pharmacy page
(site/pharmacy/). Only our pre-registrations, aggregates, our model's own
outputs and derived vectors go in — never Erowid source text.

  python3 scripts/build_pharmacy_viz.py [out.json]
"""
import json, sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "site" / "pharmacy" / "data.json"
RUNS = [("exp56", "Qwen3-8B", "pharmacy.json"), ("exp56", "Qwen3-32B", "pharmacy.json"),
        ("exp56", "Qwen3-32B-d68", "pharmacy.json"), ("exp57", "Qwen3-8B", "framing.json"),
        ("exp57", "Qwen3-32B", "framing.json"), ("exp58", "Qwen3-8B", "qri.json"),
        ("exp58", "Qwen3-32B", "qri.json")]
KEEP = {"exp56": ["judge_questions", "prompts", "table", "verdicts", "receptor_x_theme_vs_random",
                  "theme_positive_controls", "receptor_cosines", "tests"],
        "exp57": ["doses", "cosines", "table", "hypotheses", "verdicts", "baseline_frame_effect"],
        "exp58": ["doses", "cosines", "convergence", "judge_check", "table", "hypotheses", "verdicts"]}


def r2(x):
    if isinstance(x, float):
        return round(x, 2)
    if isinstance(x, dict):
        return {k: r2(v) for k, v in x.items()}
    if isinstance(x, list):
        return [r2(v) for v in x]
    return x


def pca2(M):
    M = M - M.mean(0)
    U, S, _ = np.linalg.svd(M, full_matrices=False)
    xy = U[:, :2] * S[:2]
    return xy / np.abs(xy).max(), (S[:2] ** 2 / (S ** 2).sum()).tolist()


bundle = {"runs": []}
for exp, model, fn in RUNS:
    d = ROOT / "runs" / exp / model
    if not (d / fn).exists():
        continue
    res = json.loads((d / fn).read_text())
    rows = [json.loads(l) for l in open(d / "transcripts.jsonl")]
    run = {"id": f"{exp}/{model}", "exp": exp, "model": res.get("model", model),
           "layer": res.get("layer"), "prereg": json.loads((d / "hypotheses.json").read_text()),
           **{k: r2(res[k]) for k in KEEP[exp] if k in res},
           "rows": [{"frame": r.get("frame"), "axis": r["axis"], "dose": r["dose"],
                     "prompt": r["prompt"], "sample": r["sample"], "rep": r["repetition"],
                     "scores": r2(r["scores"]), "text": r["text"]} for r in rows]}
    if exp == "exp56":
        run["doses"] = sorted({r["dose"] for r in rows if r["dose"]})
        z = np.load(d / "receptors.npz")
        names = [k[2:] for k in z.files if k.startswith("D_")]
        D = np.stack([z["D_" + n] / np.linalg.norm(z["D_" + n]) for n in names])
        xy, var = pca2(D)
        run["drug_map"] = {"names": names, "xy": r2(xy.tolist()), "var": r2(var),
                           "loo_cos": r2(res["regression"]["loo_centered_cos_per_drug"])}
    bundle["runs"].append(run)
    print(f"{run['id']}: {len(run['rows'])} rows")
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(bundle, separators=(",", ":")))
print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
