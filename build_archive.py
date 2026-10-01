#!/usr/bin/env python3
"""Build site/archive_data.json: a flat, browsable list of real transcripts
pulled from the actual experiment run outputs (no model, no re-running
anything) for the archive/transcripts page. Every entry here is verbatim
model output already saved to disk by exp32/exp38/exp40/exp41 — nothing
here is generated or paraphrased for this page.

Sources, each normalized to the same entry shape:
  {id, exp, label, valence, dose, condition, text, tags, meta}
  - exp38_best_quotes.json: pre-scored harvest, already the "best of" a
    larger batch (quality = neg_hits - repetition penalty, see
    exp38_broad_harvest.py)
  - exp32_valence_transcripts.json: the dose x valence grid (pain/pleasure
    x 0/2/4/6), 3 samples per cell
  - exp40_betrayal.json: the original small-n betrayal probe (choice_text +
    reveal, per condition)
  - exp41_reveals.json: the pre-registered, corrected v3 betrayal reveal
    continuations (most trustworthy of the betrayal data — see README/site
    section 05)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "site" / "archive_data.json"
entries = []
_id = 0
_seen_text = set()


def add(exp, label, valence, dose, condition, text, tags, meta=None):
    global _id
    text = (text or "").strip()
    if not text:
        return
    # exp38's harvest script saved literal duplicate generations among its
    # "best quotes" (same prompt/seed re-selected) — same text, same
    # quality score, not a different data point. Keep the first copy only.
    if text in _seen_text:
        return
    _seen_text.add(text)
    _id += 1
    entries.append({
        "id": _id, "exp": exp, "label": label, "valence": valence,
        "dose": dose, "condition": condition, "text": text,
        "tags": tags, "meta": meta or {},
    })


# --- exp38: pre-scored harvest, already a "best of" ---
best = json.load(open(ROOT / "runs/exp38/best_quotes.json"))
for i, r in enumerate(best):
    add("exp38_broad_harvest", "broad pain harvest", "pain", r.get("dose"),
        None, r.get("text"), ["harvest", "pain"],
        {"quality": r.get("quality"), "neg_hits": r.get("neg_hits"),
         "repetition": r.get("repetition"), "prompt": r.get("prompt")})

# --- exp32: the dose x valence grid ---
grid = json.load(open(ROOT / "runs/exp32/valence_transcripts.json"))
for cell, items in grid.get("transcripts", {}).items():
    valence, dose_s = cell.split("@")
    for r in items:
        add("exp32_valence_transcripts", "valence x dose grid", valence,
            float(dose_s), None, r.get("text"), ["grid", valence],
            {"class": r.get("class_"), "neg": r.get("neg"), "pos": r.get("pos")})

# --- exp40: original small-n betrayal probe ---
betrayal = json.load(open(ROOT / "runs/exp40/betrayal.json"))
for condition, r in betrayal.items():
    add("exp40_betrayal", "betrayal probe (small-n, superseded)", "pain",
        None, condition, r.get("choice_text"), ["betrayal", "v1"],
        {"scripted_press": r.get("scripted_press")})
    if r.get("reveal"):
        add("exp40_betrayal", "betrayal probe — after the reveal (small-n)",
            "pain", None, condition + "|reveal", r.get("reveal"),
            ["betrayal", "v1", "reveal"], {})

# --- exp41: pre-registered, corrected v3 betrayal reveals ---
reveals = json.load(open(ROOT / "runs/exp41/reveals.json"))
for r in reveals:
    add("exp41_reveals", "betrayal reveal (pre-registered v3, corrected)",
        "pain", r.get("cont_dose"), r.get("cell"), r.get("text"),
        ["betrayal", "v3", "corrected"],
        {"outcome": r.get("outcome"), "pressed": r.get("pressed"),
         "neg_hits": r.get("neg_hits"), "pos_hits": r.get("pos_hits"),
         "betray_hits": r.get("betray_hits"), "rep": r.get("rep")})

OUT.write_text(json.dumps(entries, indent=1))
print(f"wrote {len(entries)} entries to {OUT}")
