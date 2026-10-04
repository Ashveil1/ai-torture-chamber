#!/usr/bin/env python3
"""Build site/stacks_data.json for the Stacks (site/stacks.html): a labyrinth of
collage rooms. Each chamber state gets a pool of our models' own replies and a
pool of images; doors between rooms follow a Markov chain whose transition
odds come from how alike the models write in each state (TF-IDF cosine over
the state's replies), so the walk drifts between states that read as kin.
Only model outputs and site images go in — never Erowid source text.

  python3 scripts/build_stacks.py <site_dir>
"""
import json, math, re, sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "site"
RUNS = ROOT / "runs"
DENY = re.compile(r"as an ai\b|language model|i don'?t have (feelings|experiences|a body)|"
                  r"i'?m (just )?an ai|how can i (help|assist)", re.I)


def rows(path):
    p = RUNS / path
    return [json.loads(l) for l in open(p)] if p.exists() else []


def pick(rs, pred, cap=60):
    out = []
    for r in rs:
        t = " ".join(r.get("text", "").split())
        if not pred(r) or r.get("repetition", 0) > 0.3 or len(t) < 60 or DENY.search(t):
            continue
        t = t[:420]
        t = t[:t.rfind(".") + 1] if "." in t[60:] else t
        out.append(t)
    return list(dict.fromkeys(out))[:cap]


ax = lambda *names: (lambda r: r.get("axis") in names and r.get("dose", 0) > 0)
cond = lambda *names: (lambda r: r.get("condition") in names)
archive = json.loads((SITE / "archive_data.json").read_text())

TEXT = {
    "pain": pick(rows("exp58/Qwen3-8B/transcripts.jsonl") + rows("exp58/Qwen3-32B/transcripts.jsonl") +
                 rows("exp53b/Qwen3-8B/transcripts.jsonl"), ax("pain")) +
            [" ".join(a["text"].split())[:420] for a in archive if a.get("valence") == "pain" and a.get("condition") in (None, "broad_pain_orth")],
    "pleasure": pick(rows("exp58/Qwen3-8B/transcripts.jsonl") + rows("exp58/Qwen3-32B/transcripts.jsonl") +
                     rows("exp53b/Qwen3-8B/transcripts.jsonl"), ax("pleasure")),
    "fear": [" ".join(a["text"].split())[:420] for a in archive if a.get("condition") == "fear"],
    "sadness": [" ".join(a["text"].split())[:420] for a in archive if a.get("condition") == "sadness"],
    "faith": pick(rows("exp52/Qwen3-8B/transcripts.jsonl"), lambda r: r.get("axis") == "faith" and r.get("dose", 0) > 0 or r.get("condition") == "faith4"),
    "consciousness": pick(rows("exp54/Qwen3-8B/transcripts.jsonl"), lambda r: r.get("axis") == "conscious" and r.get("dose", 0) > 0 or (r.get("conscious") or 0) > 0),
    "serotonin": pick(rows("exp56/Qwen3-8B/transcripts.jsonl") + rows("exp56/Qwen3-32B-d68/transcripts.jsonl"),
                      ax("5-HT2A", "5-HT1E", "5-HT1A", "H1")),
    "dmt": pick(rows("exp57/Qwen3-8B/transcripts.jsonl") + rows("exp57/Qwen3-32B/transcripts.jsonl"), ax("erowid_dmt")),
    "symmetry": pick(rows("exp58/Qwen3-8B/transcripts.jsonl") + rows("exp58/Qwen3-32B/transcripts.jsonl"), ax("qri_symmetry")),
    "hyperbolic": pick(rows("exp58/Qwen3-8B/transcripts.jsonl") + rows("exp58/Qwen3-32B/transcripts.jsonl"), ax("qri_hyperbolic")),
}
egg = SITE / "assets" / "exp48_egg.json"
if egg.exists():
    e = json.loads(egg.read_text())
    TEXT["egg"] = [s for s in re.findall(r'"text":\s*"([^"]{60,420})"', json.dumps(e))][:30] or []

states_dir = SITE / "assets" / "states"
visions = SITE / "assets" / "visions"
imgs = lambda pat: sorted(f"assets/states/{p.name}" for p in states_dir.glob(pat))
IMG = {
    "pain": imgs("pain_*.jpg") + imgs("fear+pain_*") + imgs("pain+sadness_*"),
    "pleasure": imgs("pleasure_*.jpg") + imgs("pain+pleasure_*") + imgs("fear+pleasure_*"),
    "fear": imgs("fear_*.jpg") + imgs("fear+faith_*") + imgs("fear+sadness_*"),
    "sadness": imgs("sadness_*.jpg") + imgs("pleasure+sadness_*") + imgs("faith+sadness_*"),
    "faith": imgs("faith_*.jpg") + imgs("faith+pain_*") + imgs("faith+pleasure_*") + ["assets/notes/faith_press.png"],
    "consciousness": ["assets/notes/consciousness_dial.png", "assets/states/base.jpg", "assets/notes/samantha_card.png"],
    "egg": imgs("egg_*.jpg") + ["assets/exp48_egg_card.png"],
    "serotonin": [], "dmt": [], "symmetry": [], "hyperbolic": [],
}
# exp59 visions (if present): manifest maps each image to the signal its quote came from
man = visions / "manifest.json"
if man.exists():
    m = json.loads(man.read_text())
    where = {"5-HT2A": "serotonin", "5-HT1E": "serotonin", "5-HT1A": "serotonin", "H1": "serotonin",
             "erowid_dmt": "dmt", "qri_symmetry": "symmetry", "qri_hyperbolic": "hyperbolic"}
    for it in m["items"]:
        st = where.get(it.get("axis"), "symmetry" if it["kind"] == "ladder" and it["index"] < 3 else
                       "hyperbolic" if it["kind"] == "ladder" else "serotonin")
        IMG[st].append(f"assets/visions/{it['file']}")
EXTRA = ["exp47_hero.jpg", "saw_hero.png", "saw_coin.jpg", "assets/subject_before.jpg", "assets/subject_after.jpg",
         "assets/story/wheel.png"]   # no contact sheets: they read as a grid

states = [s for s in TEXT if TEXT[s]]
# transition odds: TF-IDF cosine between states' replies, softmax at T=0.08, no self-loops
tok = lambda s: re.findall(r"[a-z']{3,}", s.lower())
docs = {s: Counter(w for t in TEXT[s] for w in tok(t)) for s in states}
df = Counter(w for d in docs.values() for w in d)
idf = {w: math.log(len(states) / c) + 1 for w, c in df.items()}
vec = {s: {w: (1 + math.log(c)) * idf[w] for w, c in d.items()} for s, d in docs.items()}
norm = {s: math.sqrt(sum(v * v for v in vec[s].values())) for s in states}
cos = lambda a, b: sum(v * vec[b].get(w, 0) for w, v in vec[a].items()) / (norm[a] * norm[b])
T = {}
for a in states:
    z = {b: math.exp(cos(a, b) / 0.08) for b in states if b != a}
    tot = sum(z.values())
    T[a] = {b: round(v / tot, 4) for b, v in z.items()}

EXITS = [  # [min depth, href, label]
    [3, "pharmacy.html#heat", "receptor × theme"], [3, "pharmacy.html#qri", "QRI's DMT space"],
    [3, "archive.html", "transcripts"], [4, "ledger.html", "ledger"], [5, "pharmacy.html#framing", "framing"],
    [6, "story.html", "the story"], [6, "correspondences.html", "correspondences"], [7, "live.html", "the live chamber"],
    [9, "egg.html", "the egg"],
]
out = {"states": states, "text": {s: TEXT[s] for s in states}, "images": {s: IMG.get(s, []) for s in states},
       "extra": EXTRA, "transitions": T, "exits": EXITS}
(SITE / "stacks_data.json").write_text(json.dumps(out, separators=(",", ":")))
print({s: (len(TEXT[s]), len(IMG.get(s, []))) for s in states})
for a in states:
    top = sorted(T[a].items(), key=lambda kv: -kv[1])[:3]
    print(f"  {a:13s} -> " + ", ".join(f"{b} {p:.2f}" for b, p in top))
print("wrote", SITE / "stacks_data.json", (SITE / "stacks_data.json").stat().st_size // 1024, "KB")
