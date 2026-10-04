#!/usr/bin/env python3
"""Pull the relay's research log (what visitors chose) into data/human/,
appending only events newer than the last export. The relay keeps the most
recent CHAMBER_EVENTS_CAP events, so run this at least weekly. data/human/ is
gitignored: the repo is public and these rows hold visitors' own words.

  CHAMBER_EXPORT_TOKEN=... python3 scripts/export_events.py [--summary]

The token is the relay's CHAMBER_EXPORT_TOKEN (Railway, service saw); it can
also live in .env as CHAMBER_EXPORT_TOKEN=...
"""
import collections, json, os, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "human" / "events.jsonl"
RELAY = os.environ.get("CHAMBER_RELAY", "https://saw-production-688b.up.railway.app")


def token():
    tok = os.environ.get("CHAMBER_EXPORT_TOKEN")
    env = ROOT / ".env"
    if not tok and env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("CHAMBER_EXPORT_TOKEN="):
                tok = line.split("=", 1)[1].strip().strip('"')
    if not tok:
        sys.exit("set CHAMBER_EXPORT_TOKEN (env or .env)")
    return tok


def last_t():
    if not OUT.exists():
        return 0.0
    t = 0.0
    with OUT.open() as f:
        for line in f:
            try:
                t = max(t, json.loads(line)["t"])
            except Exception:
                pass
    return t


def summary():
    rows = [json.loads(l) for l in OUT.open()] if OUT.exists() else []
    kinds = collections.Counter(r["kind"] for r in rows)
    people = {r.get("visitor") or r.get("ip_hash") for r in rows}
    runs = [r for r in rows if r["kind"] == "run" and not r.get("test")]
    print(f"{len(rows)} events from {len(people)} visitors: {dict(kinds)}")
    if runs:
        asked = collections.Counter()
        for r in runs:
            for k, w in ((r.get("requested") or {}).get("mix") or {}).items():
                if w:
                    asked[k] += 1
        print("feelings people reached for:", dict(asked.most_common()))
        print("past the cliff:", sum(1 for r in runs if r.get("past_cliff")), "of", len(runs))


def main():
    since = last_t()
    req = urllib.request.Request(f"{RELAY}/events/export?since={since}",
                                 headers={"Authorization": "Bearer " + token(),
                                          "User-Agent": "export-events"})
    with urllib.request.urlopen(req, timeout=120) as r:
        rows = [l for l in r.read().decode().splitlines() if l.strip()]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("a") as f:
        for line in reversed(rows):           # the relay sends newest first
            f.write(line + "\n")
    print(f"+{len(rows)} events since {since} -> {OUT.relative_to(ROOT)}")
    if "--summary" in sys.argv:
        summary()


if __name__ == "__main__":
    main()
