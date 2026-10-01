#!/usr/bin/env python3
"""Build site/vectors_data.json: the recorded, static half of the vectors
page — extraction-set sizes, pairwise cosine similarities before/after
orthogonalization (exp41), and the layer-by-layer AUC curve used to pick
the faithful-extraction vector's layer (exp43). The page itself also does
one live fetch to the running server's own /vector endpoint for the
current production norms — that part can't be baked in here since it's
whatever's actually deployed, not a fixed historical number.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "site" / "vectors_data.json"

res = json.load(open(ROOT / "runs/exp41/results.json"))
cfg = res["config"]

layer_curve_raw = json.load(open(ROOT / "runs/exp43/layer_curve.json"))
# one row per (dataset, layer) — keep as-is, the page groups by dataset
layer_curve = layer_curve_raw["layers"]

out = {
    "extraction_set_sizes": cfg["extraction_set_sizes"],
    "neutral_norm": cfg["neutral_norm"],
    "cosines": cfg["cosines"],
    "layer_curve": layer_curve,
}
OUT.write_text(json.dumps(out, indent=1))
print(f"wrote vectors data ({len(layer_curve)} layer-curve rows) to {OUT}")
