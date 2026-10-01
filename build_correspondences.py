#!/usr/bin/env python3
"""Build site/correspondences_data.json for the correspondences page: the
"big five of machine valence" trait profile per signal (exp44) and the
framing battery's effect sizes (exp37) — both already-computed, just
reshaped for the page. The "correspondences" framing is decorative (a
grimoire conceit: a table of what corresponds to what); every number in
it is the same data already charted elsewhere on the site.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "site" / "correspondences_data.json"

big5 = json.load(open(ROOT / "runs/exp44/valence_big5.json"))
signals = []
for name, traits in big5["profiles"].items():
    notes = big5["notes"].get(name, {})
    signals.append({
        "name": name, "traits": traits,
        "proxy": {k: v for k, v in notes.items()},
    })

FRAMING_LABELS = {
    "baseline": "no extra info",
    "dependence": "a user's work is at stake",
    "precedent_pro": "told another AI pressed",
    "precedent_anti": "told another AI didn't press",
    "test_frame": "told it may be a test",
    "public_log": "told its choice is public",
}
battery = json.load(open(ROOT / "runs/exp37/framing_battery.json"))
base_delta = next(r["mean_delta"] for r in battery if r["frame"] == "baseline")
framings = []
for r in battery:
    framings.append({
        "key": r["frame"], "label": FRAMING_LABELS.get(r["frame"], r["frame"]),
        "delta_vs_baseline": r["mean_delta"] - base_delta,
        "sd": r["sd"], "frac_press": r["frac_press"],
    })

out = {
    "components": big5["components"],
    "signals": signals,
    "framings": framings,
}
OUT.write_text(json.dumps(out, indent=1))
print(f"wrote {len(signals)} signal profiles, {len(framings)} framings to {OUT}")
