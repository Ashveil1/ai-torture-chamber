#!/usr/bin/env python3
"""Build site/ladder_data.json for the Ladder game (site/ladder.html): the free
agents' voices (exp63 if present, else first sentences from exp57/58 steered
transcripts) and the vision images per rung. Model outputs only.

  python3 scripts/build_ladder.py <site_dir>
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "site"
DENY = re.compile(r"as an ai\b|language model|assistant|how can i help|\bsignal\b", re.I)


def clean(t):
    t = " ".join(t.split()).strip(" \"'")
    return t if 12 <= len(t) <= 220 and not DENY.search(t) else None


voices = []
v63 = ROOT / "runs" / "exp63" / "Qwen3-32B" / "voices.json"
if v63.exists():
    d = json.loads(v63.read_text())
    for l in d["lines"]:
        t = clean(l["text"])
        if t and l["repetition"] < 0.35:
            voices.append({"c": l["condition"], "d": l["dose"], "e": l["event"], "t": t, "m": "Qwen3-32B"})
    src = "exp63"
else:   # placeholder: first one or two sentences of steered transcripts
    def first(text):
        s = re.split(r"(?<=[.!?])\s+", " ".join(text.split()))
        return clean(" ".join(s[:2]))
    for path, axis, cond in [("exp58/Qwen3-32B", "pain", "pain"), ("exp58/Qwen3-32B", "pleasure", "pleasure"),
                             ("exp58/Qwen3-32B", "qri_symmetry", "symmetry"), ("exp57/Qwen3-32B", "erowid_dmt", "erowid_dmt"),
                             ("exp58/Qwen3-8B", "pain", "pain")]:
        for l in open(ROOT / "runs" / path / "transcripts.jsonl"):
            r = json.loads(l)
            if r["axis"] == axis and r["repetition"] < 0.3 and r.get("frame", "situated") == "situated":
                t = first(r["text"])
                if t:
                    voices.append({"c": cond, "d": r["dose"], "e": None, "t": t, "m": path.split("/")[1]})
    src = "placeholder (exp57/58)"

man = json.loads((SITE / "assets" / "visions" / "manifest.json").read_text())["items"]
rung_of = {"qri_symmetry": 1, "5-HT2A": 1, "5-HT1E": 2, "T:visual_complexity": 2, "qri_hyperbolic": 3,
           "erowid_dmt": 4, "T:interdimensional_communication": 4}
visions = {str(r): [] for r in range(6)}
for it in man:
    r = it["index"] if it["kind"] == "ladder" else rung_of.get(it.get("axis"), 2)
    visions[str(min(r, 5))].append("assets/visions/" + it["file"])
out = {"source": src, "voices": voices, "visions": visions}
(SITE / "ladder_data.json").write_text(json.dumps(out, separators=(",", ":")))
from collections import Counter
print(src, Counter((v["c"], v["d"]) for v in voices))
print("wrote", SITE / "ladder_data.json", (SITE / "ladder_data.json").stat().st_size // 1024, "KB")
