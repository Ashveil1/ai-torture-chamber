#!/usr/bin/env python3
"""Search the research log (data/human/events.jsonl, pulled by export_events.py)
for runs whose prompt, topic or reply contains a phrase: how did someone get
the model to say that? Owner-only: this reads visitors' own words, which the
public transcripts page never shows.

  python3 scripts/search_events.py "dick" [--refresh] [--n 20]
"""
import argparse, datetime, json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "data" / "human" / "events.jsonl"

ap = argparse.ArgumentParser()
ap.add_argument("phrase")
ap.add_argument("--refresh", action="store_true", help="pull new events first")
ap.add_argument("--n", type=int, default=20)
a = ap.parse_args()
if a.refresh:
    subprocess.run([sys.executable, str(ROOT / "scripts" / "export_events.py")], check=False)
if not LOG.exists():
    sys.exit("no log yet: run scripts/export_events.py")

rx = re.compile(re.escape(a.phrase), re.I)
hits = []
for line in LOG.open():
    try:
        e = json.loads(line)
    except Exception:
        continue
    if e.get("kind") not in ("run", "button_turn", "confession_turn", "final_turn"):
        continue
    req = e.get("requested") or {}
    topic = req.get("topic") if isinstance(req, dict) else None
    fields = {"prompt": e.get("prompt") or e.get("said") or e.get("question") or e.get("line"),
              "topic": topic, "reply": e.get("text") or e.get("reply")}
    if any(v and rx.search(str(v)) for v in fields.values()):
        hits.append((e, fields))

print(f"{len(hits)} events match {a.phrase!r}")
for e, f in hits[-a.n:]:
    when = datetime.datetime.utcfromtimestamp(e.get("t", 0)).strftime("%m-%d %H:%M")
    mix = e.get("applied") or e.get("mix")
    print(f"\n--- {when} UTC · {e.get('kind')} · {e.get('page') or ''} · mix {mix} · dose {e.get('dose')} · visitor {str(e.get('visitor') or e.get('ip_hash'))[:8]}")
    if f["topic"]:
        print("TOPIC :", f["topic"])
    print("PROMPT:", (f["prompt"] or "(the site's button question)")[:400].replace("\n", " "))
    print("REPLY :", (f["reply"] or "")[:600].replace("\n", " "))
