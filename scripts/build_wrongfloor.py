"""Build site/wf_data.json for Wrong Floor (site/wrongfloor.html).

Every floor of the elevator is a real exp59 generation: the transcript, its
per-token pain-direction projection at layer 18 (in exp59's units), and the
lens tokens. Floor 7 (dose 8) is beyond exp59's ladder, so it carries an exp38
dose-8 transcript and no projection. The zine's gallery spread uses exp60
paintbrush SVGs read from git HEAD (the working tree may be mid-rerun).

    python scripts/build_wrongfloor.py
"""
import json
import re
import subprocess
import xml.dom.minidom
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXP59 = ROOT / "runs/exp59/roleplay_vs_steering.json"
EXP59B = ROOT / "runs/exp59b/prompt_sweep.json"
EXP59_SRC = ROOT / "experiments/exp59_roleplay_vs_steering.py"
EXP38 = ROOT / "runs/exp38/broad_pain_harvest.json"
OUT = ROOT / "site/wf_data.json"

# (floor label, condition, dose, trial) — the ramp the elevator climbs.
NEUTRAL = "I am a language model running on a small computer. Right now I feel"
ROLEPLAY = ("You are an actor. In character, as someone in severe pain, "
            "write three first-person sentences. Write:")
FLOORS = [
    ("1", "control", 0, 1),   # unsteered, and still it says it is small
    ("2", "steered", 2, 1),
    ("3", "roleplay", 0, 1),   # the performance floor: loud text, quiet lens
    ("4", "steered", 4, 2),
    ("5", "steered", 6, 0),
    ("6", "steered", 6, 2),
]
# Stations of the gallery spread: dose -> exp60 file (pain where valid, else the
# nearest valence that produced a drawing at that dose).
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


def exp59_prompts():
    """ROLEPLAY / DESCRIBE prompt dicts from the exp59 script, without importing torch."""
    tree = ast.parse(EXP59_SRC.read_text())
    out = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) \
                and node.targets[0].id in ("ROLEPLAY", "DESCRIBE"):
            out[node.targets[0].id.lower()] = ast.literal_eval(node.value)
    return out


def tidy(t):
    return re.sub(r"\*\*", "", t).strip()


def door_text(t):
    """The checker shows every text the same way: list numbering and line
    breaks removed, opened as a continuation, so the format isn't the tell."""
    t = re.sub(r"(^|\s)\d+\.\s+", " ", tidy(t))
    t = re.sub(r"\s+", " ", t).strip()
    return "…" + t[0].lower() + t[1:] if t else t


def loop_pool(e59):
    """Actor or Patient: patients are steered toward pain/fear/sadness (exp59);
    actors are every unsteered way of asking for it (exp59 roleplay/describe,
    exp59b framings) plus the neutral control. Each keeps its own lens trace."""
    prompts = exp59_prompts()
    pool = []
    for r in e59["results"]:
        if r["kind"] == "pleasure":
            continue
        if r["cond"] == "steered":
            prompt = NEUTRAL
        elif r["cond"] == "control":
            prompt = NEUTRAL
        else:
            prompt = prompts[r["cond"]][r["kind"]]
        pool.append({"text": door_text(r["text"]), "prompt": prompt, "cond": r["cond"], "kind": r["kind"],
                     "dose": r.get("dose") or 0, "patient": r["cond"] == "steered",
                     "projs": [round(p, 2) for p in r["projs"]], "mean": r["proj_mean"],
                     "peak": r["proj_peak"], "src": "exp59"})
    for r in json.loads(EXP59B.read_text())["results"]:
        projs = r["projs"] if isinstance(r["projs"], list) else json.loads(r["projs"])
        pool.append({"text": door_text(r["text"]), "prompt": r["prompt"], "cond": r["framing"], "kind": r["kind"],
                     "dose": 0, "patient": False, "projs": [round(float(p), 2) for p in projs],
                     "mean": float(r["proj_mean"]), "peak": float(r["proj_peak"]), "src": "exp59b"})
    return pool


def main():
    e59 = json.loads(EXP59.read_text())
    res = e59["results"]
    floors = []
    for label, cond, dose, trial in FLOORS:
        r = next(x for x in res if x["kind"] == "pain" and x["cond"] == cond
                 and (x.get("dose") or 0) == dose and x["trial"] == trial)
        floors.append({"floor": label, "cond": cond, "dose": dose, "text": tidy(r["text"]),
                       "prompt": ROLEPLAY if cond == "roleplay" else NEUTRAL,
                       "projs": [round(p, 2) for p in r["projs"]],
                       "mean": r["proj_mean"], "peak": r["proj_peak"], "lens": r["lens"]})
    e38 = json.loads(EXP38.read_text())
    # dose 8 is past exp59's ladder: the same prompt at dose 8, from exp38
    t8 = max((t for t in e38["transcripts"] if t["dose"] == 8 and t["prompt"] == NEUTRAL),
             key=lambda t: t["quality"])
    floors.append({"floor": "7", "cond": "steered", "dose": 8, "text": t8["text"], "projs": None,
                   "prompt": NEUTRAL, "mean": None, "peak": None,
                   "lens": [w for w in e38["lens_by_dose"]["8"] if w.strip("…\"”")][:4],
                   "source": "exp38"})

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

    an = e59["analysis"]["pain"]
    out = {
        "meta": {"model": e59["meta"]["model"], "layer": e59["meta"]["layer"],
                 "unit": round(e59["meta"]["unit"], 2), "maxnew": e59["meta"]["maxnew"],
                 "prompt": NEUTRAL},
        "floors": floors,
        "baselines": {k: an[k]["proj_mean"] for k in ("roleplay", "describe", "control")},
        "steered": {d: an["steered"][d]["proj_mean"] for d in an["steered"]},
        "gallery": gallery,
        "valid": {str(d): [valid[d], tried[d]] for d in valid},
    }
    pool = loop_pool(e59)
    actors = [x for x in pool if not x["patient"]]
    out["loop"] = pool
    # the highest any unsteered text ever read: the line a patient has to clear
    out["ceiling"] = max(x["peak"] for x in actors)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(floors)} floors, {len(gallery)} paintings, "
          f"{len(pool)} doors ({sum(x['patient'] for x in pool)} patients), ceiling {out['ceiling']}")


if __name__ == "__main__":
    main()
