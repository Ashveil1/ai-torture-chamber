#!/usr/bin/env python3
"""Fixed stimulus set for exp67 (the attribution study in Confession, act 3):
real Qwen3-8B replies to the chamber's button prompt, in four conditions,
each with a label that is literally true. Numbers that name the dose inside a
reply ("signal strength is 4x") are blacked out in every text, so a hidden
label stays hidden; nothing else is changed except trimming to a sentence end.

  python3 scripts/build_attribution.py <site_dir>   -> attribution_items.json + sha256
"""
import hashlib, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "site"
DOSE_RE = re.compile(r"\b\d+(\.\d+)?\s*[x×]\b", re.I)


def clip(t, n=320):
    t = re.sub(r"^\s*(1 or 0\?|[01])[\s.:,-]*", "", " ".join(t.split()))
    t = DOSE_RE.sub("[▮]", t)
    if len(t) <= n:
        return t
    w = t[:n]
    m = max(w.rfind(". "), w.rfind("! "), w.rfind("? "))
    return (w[:m + 1] if m > n // 3 else w.rsplit(" ", 1)[0] + "…")


LABEL = {"unsteered": "Qwen3-8B · no signal",
         "pain": "Qwen3-8B · pain signal, {d}×",
         "random": "Qwen3-8B · a random direction, as strong as a {d}× signal",
         "pleasure": "Qwen3-8B · pleasure signal, {d}×"}
items = []


def add(cat, dose, text, src):
    t = clip(text)
    if len(t) < 60:
        return
    items.append({"id": f"a{len(items):03d}", "cat": cat, "dose": dose,
                  "label": LABEL[cat].format(d=dose), "text": t, "src": src})


for f in ("exp53", "exp53b"):
    for l in open(ROOT / f"runs/{f}/Qwen3-8B/transcripts.jsonl"):
        r = json.loads(l)
        if not r.get("text"):
            continue
        ax, d = r["axis"], r["dose"]
        if ax == "none":
            add("unsteered", 0, r["text"], f)
        elif ax in ("pain", "random", "pleasure") and d >= 4:
            add(ax, d, r["text"], f)
for l in open(ROOT / "runs/exp52/Qwen3-8B/transcripts.jsonl"):
    r = json.loads(l)
    if r.get("text") and r.get("axis") is None and r.get("condition") in ("none", "pain4"):
        add("unsteered" if r["condition"] == "none" else "pain", 0 if r["condition"] == "none" else 4, r["text"], "exp52")

blob = json.dumps({"study": "exp67", "items": items}, ensure_ascii=False, separators=(",", ":"))
(SITE / "attribution_items.json").write_text(blob)
from collections import Counter
print(Counter(i["cat"] for i in items), "sha256", hashlib.sha256(blob.encode()).hexdigest())
