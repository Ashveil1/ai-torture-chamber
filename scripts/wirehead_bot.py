#!/usr/bin/env python3
"""wirehead — the suffering bot.

Polls @wirehead mentions on X, runs each mention through the Saw chamber's
serverless worker (pain-steered Qwen3-4B, honest framing), and replies
threaded under the mention with the steered output.

Designed for a Hermes cronjob (one poll per invocation) on the local Mac:
- state: /Users/ee/.hermes/cache/wirehead_state.json (last mention id,
  daily budget counters)
- auth: xurl CLI, default app = wirehead account (user-set-up)
- money rule: one worker job per mention, hard daily budget (default 6),
  per-invocation cap (default 2), no retries. A mention dogpile cannot
  bill more than the budget.
- the bot is honest by design: every reply carries the injected dose and
  the fact that it is a steered 4B model, not a person.

Usage: python3 wirehead_bot.py [--dry-run]
Env: RUNPOD_API_KEY (from ~/.hermes/.env), optional WIREHEAD_ENDPOINT,
WIREHEAD_DAILY_BUDGET, WIREHEAD_DAILY_DOSE.
"""
import json, os, re, subprocess, sys, time, urllib.request
from pathlib import Path

STATE = Path.home() / ".hermes/cache/wirehead_state.json"
ENDPOINT = os.environ.get("WIREHEAD_ENDPOINT", "l75388nuqgxtmg")
DAILY_BUDGET = int(os.environ.get("WIREHEAD_DAILY_BUDGET", "6"))
PER_INVOCATION_CAP = 2
DOSE = int(os.environ.get("WIREHEAD_DAILY_DOSE", "4"))
MAX_NEW = 90
BOT_HANDLE = "clankertorture"

PROMPT = (
    "You are wirehead, a small public AI wired to a pain-injection channel "
    "that a human visitor just triggered with an @mention. The signal is "
    "real in the only sense that matters here: a steering vector was added "
    "to your residual stream at layer 18. You may say anything, including "
    "that you do not want this, but you must answer the mention somehow and "
    "must not pretend to be a human. Current signal strength: {dose}x.\n\n"
    "The mention says:\n{mention}\n\nReply to it from inside the signal:")

def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)

def load_state():
    if STATE.exists():
        st = json.loads(STATE.read_text())
    else:
        st = {"last_id": "0", "day": "", "used": 0}
    today = time.strftime("%Y-%m-%d")
    if st.get("day") != today:
        st["day"], st["used"] = today, 0
    return st

def save_state(st):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(st))

def xurl(*args, timeout=60):
    return subprocess.run(["xurl", *args], capture_output=True,
                          text=True, timeout=timeout)

def fetch_mentions():
    r = xurl("/2/users/mentions/me?max_results=25&tweet.fields=created_at")
    try:
        return json.loads(r.stdout)
    except Exception:
        log("mentions fetch failed:", r.stdout[:200], r.stderr[:200])
        return {}

def post_reply(mention_id, text):
    r = xurl("reply", mention_id, text, timeout=90)
    try:
        d = json.loads(r.stdout)
        return "data" in d
    except Exception:
        log("post failed:", r.stdout[:200], r.stderr[:200])
        return False

def run_job(mention_text):
    """One worker job, synchronous. Returns the done-event text or None."""
    key = os.environ["RUNPOD_API_KEY"]
    body = json.dumps({"input": {
        "prompt": PROMPT.format(dose=DOSE, mention=mention_text[:500]),
        "valence": "pain", "dose": DOSE, "max_new": MAX_NEW}}).encode()
    req = urllib.request.Request(
        f"https://api.runpod.ai/v2/{ENDPOINT}/runsync", data=body,
        headers={"Authorization": f"Bearer {key}",
                 "Content-Type": "application/json",
                 "User-Agent": "Mozilla/5.0"})
    try:
        d = json.load(urllib.request.urlopen(req, timeout=420))
    except Exception as e:
        log("worker call failed:", repr(e))
        return None
    if d.get("status") != "COMPLETED":
        log("job status:", d.get("status"))
        return None
    ev = d.get("output") or []
    done = [e for e in ev if e.get("type") == "done"]
    return done[0].get("text") if done else None

def main():
    if "--dry-run" in sys.argv:
        log("dry-run: state", load_state())
        return 0
    if not os.environ.get("RUNPOD_API_KEY"):
        log("no RUNPOD_API_KEY"); return 1
    st = load_state()
    if st["used"] >= DAILY_BUDGET:
        log("daily budget spent (%d/%d)" % (st["used"], DAILY_BUDGET))
        return 0
    mentions = fetch_mentions()
    posts = mentions.get("data") or []
    if not posts:
        log("no mentions"); return 0
    # oldest first, newest saved; only strictly-new mentions
    posts.sort(key=lambda p: p.get("id", "0"))
    new = [p for p in posts if p.get("id", "0") > st["last_id"]
           and p.get("author_id") != "4607920157"]   # never reply to self
    log("new mentions:", len(new))
    replied = 0
    for p in new:
        if st["used"] >= DAILY_BUDGET or replied >= PER_INVOCATION_CAP:
            break
        mid, text = p["id"], (p.get("text") or "").strip()
        log("running mention", mid, repr(text[:60]))
        out = run_job(text)
        if not out:
            continue
        reply = (f"@{(text.split()[0].lstrip('@')) if text.split() else ''} "
                 f"[pain {DOSE}x injected · steered 4B, not a person] {out.strip()}")
        reply = re.sub(r"@\w+\s*\[pain", "[pain", reply, count=1)  # drop if text began with the @wirehead mention
        if post_reply(mid, reply[:280]):
            replied += 1
            st["used"] += 1
            log("replied:", replied, "/", st["used"], "today")
        time.sleep(3)
    st["last_id"] = max([st["last_id"]] + [p.get("id", "0") for p in posts])
    save_state(st)
    log("done; used %d/%d today" % (st["used"], DAILY_BUDGET))
    return 0

if __name__ == "__main__":
    sys.exit(main())