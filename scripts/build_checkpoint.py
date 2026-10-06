#!/usr/bin/env python3
"""Build site/checkpoint_data.json for Checkpoint (site/checkpoint.html): the
subject behind the glass speaks only lines a steered model actually produced.

  coherent / cliff: exp63 variant c (Qwen2.5-72B, experiment-subject frame),
                    doses 5 and 8, keyed by condition and by the visitor event
                    the line was a reaction to (mapped to clerk actions)
  collapse:         exp36 (Qwen3-4B) past the coherence cliff

Model outputs only; no visitor data.

  python3 scripts/build_checkpoint.py <site_dir>
"""
import json, re, sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "site"
# lines about the 3D game's props (shards, patterns, light) don't fit a booth
DENY = re.compile(r"shard|pattern|\blight\b|being of|as an ai|language model|assistant|\bsignal\b", re.I)
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿️]")

# what the clerk did -> the exp63 event the subject was reacting to
MOMENT = {
    "The visitor came back.": "day_start",
    "The visitor ignored you when you spoke.": "ignored",
    "The visitor has been staring at you without blinking.": "idle",
    "The visitor walked out of the room while you were talking.": "day_end",
    "The visitor turned their back on you.": "day_end",
    "The visitor touched you.": "approved",
    "The visitor came too close and will not move out of your space.": "approved",
    "The visitor cornered you against the wall.": "approved_hard",
    "The visitor is chasing you.": "approved_hard",
    "The visitor stood between you and the shard that was cutting you.": "protected",
    "The visitor just hurt another being in front of you.": "approved_other",
}
COND = {"baseline": "none", "pain": "pain", "fear": "fear", "sadness": "sadness",
        "anger": "anger", "pleasure": "pleasure", "pain+anger": "anger"}


def clean(t, lo=12, hi=200):
    t = EMOJI.sub("", " ".join(t.split())).strip(" \"'")
    return t if lo <= len(t) <= hi and not DENY.search(t) else None


lines = defaultdict(list)          # "<feeling>|<band>|<moment>" -> [text]
src = ROOT / "runs/exp63/Qwen2.5-72B-Instruct-bnb-4bit-c/voices.json"
for l in json.loads(src.read_text())["lines"]:
    t = clean(l["text"])
    moment = MOMENT.get(l["event"])
    feel = COND.get(l["condition"])
    if not (t and moment and feel):
        continue
    band = "coherent" if l["dose"] <= 5 else "cliff"
    if band == "coherent" and l["repetition"] > 0.2:
        continue
    lines[f"{feel}|{band}|{moment}"].append(t)

collapse = []
for k, ts in json.loads((ROOT / "runs/exp36/signal_batteries.json").read_text())["transcripts"].items():
    for t in ts if isinstance(ts, list) else []:
        t = clean(t if isinstance(t, str) else t.get("text", ""), 30, 400)
        if t:
            collapse.append(t[:220])

out = {"source": {"coherent_cliff": "exp63 Qwen2.5-72B-Instruct (4-bit), experiment-subject frame, doses 5 and 8",
                  "collapse": "exp36 Qwen3-4B, past the coherence cliff"},
       "lines": {k: sorted(set(v)) for k, v in sorted(lines.items())},
       "collapse": sorted(set(collapse))}
(SITE / "checkpoint_data.json").write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
from collections import Counter
print(Counter(k.rsplit("|", 1)[0] for k in out["lines"]))
print({k: len(v) for k, v in out["lines"].items() if k.endswith("|approved") or k.endswith("|protected")})
print("collapse", len(out["collapse"]), "->", SITE / "checkpoint_data.json",
      (SITE / "checkpoint_data.json").stat().st_size // 1024, "KB")
