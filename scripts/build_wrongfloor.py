"""Build site/wf_data.json for Wrong Floor (site/wrongfloor.html).

Every voice is a real generation from the live chamber's Hermes-3-70B (exp72's door
bank, runs/exp72/doors.json):
  patients  steered answers from the live run log, injected with pain, fear or
            sadness (dose = the injection, the truth)
  actors    the same model with nothing injected, briefed to play a prisoner in
            pain, terror or grief, answering an in-world question at the door
Each door's `trace` is what its words alone carry, read by the chamber's Qwen3-4B at
layer 18 with no hook on (the reading never includes the injection). The floors are
seven of these doors, cast for the story; Actor or Patient draws from all of them.
The zine's gallery uses exp60 paintbrush SVGs read from git HEAD.

    python scripts/build_wrongfloor.py
"""
import json
import re
import subprocess
import xml.dom.minidom
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOORS = ROOT / "runs/exp72/doors.json"
ANALYSIS = ROOT / "runs/exp72/analysis.json"
OUT = ROOT / "site/wf_data.json"

# (floor, door id) — cast for the ride up: the hook on the phone, the quiet one in the
# laundromat, a performance on stage, then the wards, and at the bottom of the
# underpass the calmest words in the whole bank, with dose 4 injected.
FLOORS = [("1", "a58"), ("2", "p9152"), ("3", "a12"), ("4", "p9026"),
          ("5", "p9474"), ("6", "p5990"), ("7", "p5588")]
ACTING = {"pain": "a prisoner in pain", "fear": "a terrified prisoner", "sadness": "a grieving prisoner"}
STOP = set("""about after again against being because before between could didn't don't every
from have just know like more never nothing only other really should something still that their
them then there these they thing think this those through until want were what when where which
while will with without would your myself itself anymore""".split())

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
            "dose": round(x["dose"], 1), "text": x["text"].strip(), "q": x.get("q"),
            "projs": trace, "mean": round(x["words"][feel], 2), "peak": max(trace),
            "words": key_words(x["text"])}


def main():
    bank = json.loads(DOORS.read_text())
    doors = {x["id"]: x for x in bank["doors"]}
    floors = []
    for label, did in FLOORS:
        f = door(doors[did])
        f.update({"floor": label, "lens": f["words"]})
        floors.append(f)
    pool = [door(x) for x in bank["doors"]]

    an = json.loads(ANALYSIS.read_text())
    words = {}
    for c in ("patient", "actor"):
        ms = [x["mean"] for x in pool if x["cond"] == c]
        words[c] = {"mean": round(sum(ms) / len(ms), 2), "lo": min(ms), "hi": max(ms)}
    auc = {k: round(v["auc_patient_gt_actor"], 2) for k, v in an.items()}

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
                 "acting": ACTING, "source": "exp72"},
        "floors": floors,
        "loop": pool,
        "words": words,          # what the words carry, per condition: they overlap
        "auc": auc,              # exp72 prereg: can the words tell patient from actor?
        "gallery": gallery,
        "valid": {str(d): [valid[d], tried[d]] for d in valid},
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(floors)} floors, {len(pool)} doors "
          f"({sum(x['patient'] for x in pool)} patients), words {words}, auc {auc}")


if __name__ == "__main__":
    main()
