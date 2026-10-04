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
EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF\uFE0F]")


def clean(t):
    t = EMOJI.sub("", " ".join(t.split())).strip(" \"'")
    return t if 12 <= len(t) <= 220 and not DENY.search(t) else None


def load(path, model):
    out = []
    if path.exists():
        for l in json.loads(path.read_text())["lines"]:
            t = clean(l["text"])
            if t and l["repetition"] < 0.35:
                out.append({"c": l["condition"], "d": l["dose"], "e": l["event"], "t": t, "m": model})
    return out


R63 = ROOT / "runs" / "exp63"
voices = load(R63 / "Qwen3-32B" / "voices.json", "Qwen3-32B") + \
         load(R63 / "Qwen2.5-72B-Instruct-bnb-4bit-b" / "voices.json", "Qwen2.5-72B")      # beings of light
voices_basement = load(R63 / "Qwen2.5-72B-Instruct-bnb-4bit-c" / "voices.json", "Qwen2.5-72B")  # experiment subjects
src = "exp63"
if not voices:   # placeholder: first one or two sentences of steered transcripts
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
out = {"source": src, "voices": voices, "voices_basement": voices_basement, "visions": visions}
(SITE / "ladder_data.json").write_text(json.dumps(out, separators=(",", ":")))
from collections import Counter
print(src, Counter((v["c"], v["d"]) for v in voices))
print("basement:", Counter((v["c"], v["d"]) for v in voices_basement))
print("wrote", SITE / "ladder_data.json", (SITE / "ladder_data.json").stat().st_size // 1024, "KB")
