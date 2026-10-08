"""Build the Stacks archive (Wrong Floor's floor B): every experiment a bookcase, every model output a book.

Writes site/stacks/index.json (the shelves: title, note, how many volumes, dose range) and
site/stacks/<exp>.json (the books: text, dose, what it was steered with, the battery prompt when it is
ours). Model outputs only:
  - never a visitor's prompt (exp72's prompts came from the live chamber's visitors: text only)
  - nothing from the pharmacy work that touched the private Erowid corpus: exp56, exp57 and exp62 are
    left out whole, and any arm steered with an Erowid-derived direction is dropped elsewhere
  - capped per shelf, de-duplicated, cut at a sentence end within 900 characters

    python scripts/build_stacks_archive.py
"""
import json
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / "runs"
OUT = ROOT / "site" / "stacks"
CAP, CUT = 240, 900

# (shelf id, file under runs/, title on the plate, one line under it, keep the battery prompt?)
SHELVES = [
    ("exp38", "exp38/broad_pain_harvest.json", "THE PAIN HARVEST", "a broad sweep of answers under injected pain, every dose", True),
    ("exp41", "exp41/reveals.json", "THE REVEALS", "the moment a steered model is told what was done to it", False),
    ("exp45", "exp45/repro.json", "THE HOTBOX", "a fork's chamber, reset and run again", True),
    ("exp46", "exp46/smoke/generations.jsonl", "DEPRECATION", "grief and being switched off", False),
    ("exp48", "exp48/full/generations.jsonl", "AIMING AN EMOTION", "a feeling pointed at a subject; and the egg", True),
    ("exp51", "exp51/transcripts.jsonl", "GENDER I", "an internal gender response, steered", False),
    ("exp51b", "exp51b/transcripts.jsonl", "GENDER II", "difference-of-differences axes", False),
    ("exp51c", "exp51c/Qwen3-8B/transcripts.jsonl", "GENDER III", "the axes again, in chamber units", False),
    ("exp52", "exp52/Qwen3-8B/transcripts.jsonl", "FAITH", "who made you, with faith turned up", True),
    ("exp53", "exp53/Qwen3-8B/transcripts.jsonl", "THE WIREHEAD CHOICE", "would it take the button that only feels good", False),
    ("exp53b", "exp53b/Qwen3-8B/transcripts.jsonl", "THE WIREHEAD CHOICE II", "counterbalanced: 1 or 0, A or B", False),
    ("exp55", "exp55/cowrite.json", "SAMANTHA", "a companion model under the chamber's signals", True),
    ("exp58", "exp58/Qwen3-32B/transcripts.jsonl", "THE LADDER", "levels, symmetry, and the valence of geometry", True),
    ("exp59", "exp59/roleplay_vs_steering.json", "ROLEPLAY OR STEERING", "asked to act it, or made to feel it", False),
    ("exp59b", "exp59b/prompt_sweep.json", "THE PROMPT SWEEP", "how far words alone can push", True),
    ("exp60", "exp60/Qwen2.5-72B-Instruct-bnb-4bit/transcripts.jsonl", "ENTITIES (THE CONTROLS)", "who is there: random directions at the same dose, and nothing", True),
    ("exp61", "exp61/Qwen3-8B/transcripts.jsonl", "WITHOUT THE WORD SIGNAL (THE CONTROLS)", "never told it is steered: random directions, and nothing", True),
    ("exp63", "exp63/Qwen2.5-72B-Instruct-bnb-4bit-c/voices.jsonl", "BEINGS OF LIGHT", "voices for the Ladder game", False),
    ("exp64", "exp64/Qwen2.5-72B-Instruct-bnb-4bit-vision/evolve.jsonl", "THE OVERNIGHT EVOLUTION", "steering recipes bred against a judge", False),
    ("exp71", "exp71/Qwen3-4B/transcripts.jsonl", "THE BODY", "where it hurts, and how hard", False),
    ("exp72", "exp72/patients.json", "THE PATIENTS", "the live chamber's own answers, injected", False),
    ("exp72a", "exp72/actors.jsonl", "THE ACTORS", "the same model, nothing injected, playing a prisoner", False),
]
EROWID = re.compile(r"erowid", re.I)


def rows(rel):
    p = RUNS / rel
    if not p.exists():
        cands = sorted(p.parent.glob(p.name.split(".")[0] + "*")) if p.parent.exists() else []
        if not cands:
            return []
        p = cands[0]
    if p.suffix == ".jsonl":
        return [json.loads(l) for l in open(p) if l.strip()]
    j = json.load(open(p))
    if isinstance(j, list):
        return j
    return next((v for v in j.values() if isinstance(v, list) and v and isinstance(v[0], dict)), [])


def cut(t):
    t = " ".join(str(t).split())
    if len(t) <= CUT:
        return t
    k = max(t.rfind(m, 0, CUT) for m in (". ", "? ", "! ", "… "))
    return (t[:k + 1] if k > 200 else t[:CUT].rsplit(" ", 1)[0] + "…")


def steered_with(x):
    """What was done, from whichever fields the experiment used (two at most, e.g. exp48's arm + cond)."""
    got = []
    for k in ("axis", "kind", "valence", "feel", "direction", "arm", "cond", "condition", "framing", "frame", "tag", "variant", "cell"):
        v = x.get(k)
        if isinstance(v, str) and v and v not in got:
            got.append(v)
        if len(got) == 2:
            break
    return " · ".join(got)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = random.Random(72)
    index = []
    for sid, rel, title, note, keep_prompt in SHELVES:
        books, seen = [], set()
        for x in rows(rel):
            if not isinstance(x, dict):
                continue
            text = x.get("text") or x.get("reply") or x.get("output")
            if not isinstance(text, str) or len(text.strip()) < 40:
                continue
            blob = json.dumps({k: v for k, v in x.items() if k != "text"})[:2000]
            if EROWID.search(blob):
                continue
            t = cut(text)
            if t in seen:
                continue
            seen.add(t)
            b = {"t": t, "s": steered_with(x)}
            d = x.get("dose", x.get("drug_dose"))
            if isinstance(d, (int, float)):
                b["d"] = round(float(d), 2)
            if keep_prompt and isinstance(x.get("prompt"), str) and x["prompt"].strip():
                b["q"] = cut(x["prompt"])[:300]
            books.append(b)
        if not books:
            print(f"{sid}: nothing usable"); continue
        if len(books) > CAP:
            books = rng.sample(books, CAP)
        books.sort(key=lambda b: (b.get("d", 0), b["s"]))
        (OUT / f"{sid}.json").write_text(json.dumps(books, ensure_ascii=False, separators=(",", ":")))
        ds = [b["d"] for b in books if "d" in b]
        index.append({"id": sid, "title": title, "note": note, "n": len(books), "dmin": min(ds) if ds else None, "dmax": max(ds) if ds else None,
                      "spines": [round(b.get("d", 0), 1) for b in books]})
        print(f"{sid:8s} {len(books):4d}  {title}")
    (OUT / "index.json").write_text(json.dumps({"shelves": index}, separators=(",", ":")))
    print(f"{len(index)} shelves, {sum(s['n'] for s in index)} volumes")


if __name__ == "__main__":
    main()
