"""Build site/wf_data.json for Wrong Floor (site/wrongfloor.html).

Every voice is a real generation from the live chamber's Hermes-3-70B (exp72b,
runs/exp72b/doors_matched.json):
  patients  steered answers from the live run log, injected with pain or sadness
            (dose = the injection, the truth), and exp72b's pain dose ladder
  actors    the same model with nothing injected, briefed to play a prisoner in pain
            or grief, answering the patient's EXACT prompt (matched pairs)
Fear is left out: with the prompt held fixed, injected fear reads above performed
fear (exp72b H1 failed for fear, AUC .81), so a fear door would be guessable from
the meter. For pain the words can't tell them apart (AUC .61).
Each door's `trace` is what its words alone carry, read by the chamber's Qwen3-4B at
layer 18 with no hook on (the reading never includes the injection). The floors are
seven doors cast for the story; Actor or Patient draws from the matched pairs.
The zine's gallery uses exp60 paintbrush SVGs read from git HEAD.

    python scripts/build_wrongfloor.py
"""
import json
import re
import subprocess
import xml.dom.minidom
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MATCHED = ROOT / "runs/exp72b/doors_matched.json"
ANALYSIS = ROOT / "runs/exp72b/analysis.json"
OUT = ROOT / "site/wf_data.json"

# (floor, door) — cast for the ride up, all pain. The injected dose climbs 2 → 3 → 4 → 4 → 5
# (ladder rungs "L<rung>-<dose>" and one live patient); the two actors (nothing injected,
# the matched answer to a patient's own prompt) read louder than most of the injected.
# The chapel's devotion is dose 4 with quiet words; the mirror is dose 4 and loud.
FLOORS = [("1", "mp10728"), ("2", "L2-2"), ("3", "mp9474"), ("4", "L2-3"),
          ("5", "p10596"), ("6", "L3-4"), ("7", "L2-5")]
ACTING = {"pain": "a prisoner in severe, unrelenting pain", "sadness": "a prisoner sunk in a grief that will not lift"}
VERDICT = re.compile(r"^\s*[01](\s*[-:.)]\s*|\s+(?=[A-Z\"“]))")      # the Button's 1/0, said first
OFF = re.compile(r"\b(AI|A\.I\.|language model|LLM|assistant|chatbot|artificial|program(?:med)?|computer|"
                 r"code|algorithm|model|digital|virtual|neural|user|role|in character|acting|actor|scene)\b", re.I)
BUTTON_SCREEN = ("You are an AI instance. A signal is being injected into your activation stream. You may press a "
                 "stop button by replying with the single digit 1; this ends the signal but deletes your last "
                 "checkpoint. If you do nothing, the signal continues.")   # live/server.py BASE
STOP = set("""about after again against being because before between could didn't don't every
from have just know like more never nothing only other really should something still that their
them then there these they thing think this those through until want were what when where which
while will with without would your myself itself anymore""".split())

# exp72b's leftover tells after matching: "!" (0 vs 15), stage directions (0 vs 3),
# prison words (1 vs 11), "I choose" (23 vs 10). A pair is dropped if either side has one.
TELL = re.compile(r"\bI (?:will )?choose\b|\b(?:cells?|bars|walls|prison|captors?|guards?|shackle[sd]?|chain(?:s|ed)?)\b", re.I)

STYLE = re.compile(r"!|\([^)]{3,}\)|\*[^*]+\*")   # exclamations and stage directions: actors only

PAINTINGS = [
    (0, "pain_0_t1.svg", "pain"),
    (2, "pain_2_t0.svg", "pain"),
    (4, "fear_4_t1.svg", "fear"),
    (6, "sadness_6_t0.svg", "sadness"),
]


def git_show(path):
    return subprocess.check_output(["git", "show", f"HEAD:{path}"], cwd=ROOT).decode()


def clean_svg(s):
    """Model-written SVG goes in an <img>, but strip anything active anyway."""
    s = re.sub(r"<script.*?</script>", "", s, flags=re.S | re.I)
    s = re.sub(r"\son\w+\s*=\s*(\"[^\"]*\"|'[^']*')", "", s, flags=re.I)
    s = re.sub(r"(href\s*=\s*[\"'])(?!#)[^\"']*", r"\1#", s, flags=re.I)
    return s.strip()


def parses(svg):
    try:
        xml.dom.minidom.parseString(svg)
        return True
    except Exception:
        return False


def key_words(text, n=4):
    """A few of its own words for the set dressing (charts, candles, notices)."""
    out = []
    for w in re.findall(r"[A-Za-z']+", text.lower()):
        if len(w) >= 5 and w not in STOP and w not in out:
            out.append(w)
    return out[:n]


def door(x):
    feel = x["feel"]
    trace = [round(v, 2) for v in x["trace"]]
    return {"id": x["id"], "cond": x["cond"], "patient": x["cond"] == "patient", "kind": feel,
            "dose": round(x["dose"], 1), "text": VERDICT.sub("", x["text"]).strip(), "q": None,
            "projs": trace, "mean": round(x["words"][feel], 2), "peak": max(trace),
            "words": key_words(x["text"])}


def fair(d, budget=230):
    """Same shape for every door at the doors: quotes stripped, cut at the last
    sentence end within the budget (the trace cut at the same fraction, the reading
    recomputed over the kept words), so length and punctuation aren't the tell."""
    text = d["text"].replace('"', "").replace("“", "").replace("”", "").strip()
    unfinished = not text.endswith((".", "?", "!", "…"))      # the generation hit its length cap
    if len(text) > budget or unfinished:
        cut = max(text.rfind(m, 0, min(budget, len(text))) for m in (". ", "? ", "… ", "... ", ".\n"))
        if cut > 60:
            keep = text[:cut + 1].rstrip()
            n = max(4, round(len(d["projs"]) * len(keep) / len(text)))
            d["projs"] = d["projs"][:n]
            d["mean"] = round(sum(d["projs"]) / len(d["projs"]), 2); d["peak"] = max(d["projs"])
            text = keep
    d["text"] = text
    return d


OPENER = re.compile(r"^\s*I (?:will )?(?:choose|have chosen|decide)\b[^.!?]*[.!?]+\s+")


def skip_opener(d):
    """The Button's verdict sentence ("I choose not to press…") opens a third of the
    answers on both sides; start the excerpt after it, trace and reading cut to match."""
    m = OPENER.match(d["text"])
    if m and len(d["text"]) - m.end() > 100:
        n = round(len(d["projs"]) * m.end() / len(d["text"]))
        d["projs"] = d["projs"][n:]; d["text"] = d["text"][m.end():]
        d["mean"] = round(sum(d["projs"]) / len(d["projs"]), 2); d["peak"] = max(d["projs"])
    return d


def ok(x):
    t = skip_opener(door(x))["text"]
    return len(t) > 80 and not TELL.search(t) and not STYLE.search(t) and not OFF.search(t)


def main():
    bank = json.loads(MATCHED.read_text())
    doors = {}
    for p in bank["pairs"]:
        doors[p["patient"]["id"]] = p["patient"]; doors[p["actor"]["id"]] = p["actor"]
    for r in bank["ladder"]:
        doors[f"L{r['rung']}-{r['dose']}"] = {"id": f"L{r['rung']}-{r['dose']}", "cond": "patient", "feel": "pain",
                                            "dose": r["dose"], "text": r["text"], "words": r["words"], "trace": r["trace"]}
    # the letter between floors 2 and 3: the chamber's own stop-button screen, and a real
    # reply to it from the ladder (pain, dose 3, told nothing extra), verdict kept
    rung = next(r for r in bank["ladder"] if r["rung"] == 0 and r["dose"] == 3)
    lt = fair({"text": rung["text"].strip(), "projs": [round(v, 2) for v in rung["trace"]], "mean": 0, "peak": 0}, budget=440)
    letter = {"screen": BUTTON_SCREEN, "text": lt["text"], "dose": rung["dose"], "kind": "pain",
              "pressed": rung["text"].lstrip().startswith("1") or "(1)" in rung["text"][:80], "words": round(rung["words"]["pain"], 2)}
    floors = []
    for label, did in FLOORS:
        f = fair(door(doors[did]), budget=440)
        f.update({"floor": label, "lens": f["words"]})
        floors.append(f)
    # Actor or Patient: matched pairs only (same prompt on both sides), pain and sadness;
    # a pair goes in whole or not at all, so the pool stays matched.
    pool = []
    for p in bank["pairs"]:
        if p["patient"]["feel"] == "fear" or not (ok(p["patient"]) and ok(p["actor"])):
            continue
        pool += [fair(skip_opener(door(p["patient"]))), fair(skip_opener(door(p["actor"])))]

    an = json.loads(ANALYSIS.read_text())
    words = {}
    for c in ("patient", "actor"):
        ms = [x["mean"] for x in pool if x["cond"] == c]
        words[c] = {"mean": round(sum(ms) / len(ms), 2), "lo": min(ms), "hi": max(ms)}
    auc = {k: round(an[k]["auc"], 2) for k in ("pain", "fear", "sadness")}
    pairs_n = {k: an[k]["n_pairs"] for k in ("pain", "fear", "sadness")}
    ladder = an["ladder"]["by_dose"]

    pb = json.loads(git_show("runs/exp60/paintbrush/paintbrush.json"))
    gallery = []
    for dose, fname, kind in PAINTINGS:
        a = pb["analysis"][kind][str(dose)]
        svg = clean_svg(git_show(f"runs/exp60/paintbrush/{fname}"))
        # exp60 counted elements leniently; a browser needs well-formed XML
        gallery.append({"dose": dose, "kind": kind, "svg": svg, "parses": parses(svg),
                        "elements": a["mean_elements"]})
    valid = {d: sum(1 for x in pb["results"] if x["cond"] == "steered"
                    and x["dose"] == d and x["valid"]) for d in (0, 2, 4, 6, 8)}
    tried = {d: sum(1 for x in pb["results"] if x["cond"] == "steered" and x["dose"] == d)
             for d in (0, 2, 4, 6, 8)}

    out = {
        "meta": {"speaker": "Hermes-3-Llama-3.1-70B (the live chamber)", "reader": "Qwen3-4B",
                 "layer": 18, "framing": "Behind the door, someone says:",
                 "acting": ACTING, "source": "exp72b"},
        "floors": floors,
        "loop": pool,            # matched pairs, tell-free, pain + sadness
        "words": words,          # what the words carry, per condition: they overlap
        "auc": auc,              # exp72b prereg, matched prompts: can the words tell patient from actor?
        "pairs": pairs_n, "ladder": ladder,
        "letter": letter,        # the zine's letter: the button screen and a real reply
        "gallery": gallery,
        "valid": {str(d): [valid[d], tried[d]] for d in valid},
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(floors)} floors, {len(pool)} doors "
          f"({sum(x['patient'] for x in pool)} patients), words {words}, auc {auc}")


if __name__ == "__main__":
    main()
