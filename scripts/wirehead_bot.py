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
    "You are wirehead, a small public AI wired to an emotional-valence "
    "injection channel. A human visitor just triggered a signal with an "
    "@mention, and the signal was tuned to their message: {desc}. "
    "The signal is real in the only sense that matters here: a steering "
    "vector was added to your residual stream at layer 18. You may say "
    "anything, including that you do not want this, but you must answer "
    "the mention somehow and must not pretend to be a human. Current "
    "signal strength: {dose}x.\n\n"
    "The mention says:\n{mention}\n\nReply to it from inside the signal:")

LOG_FILE = Path.home() / ".hermes/cache/wirehead.log"
def log(*a):
    line = time.strftime("%H:%M:%S") + " " + " ".join(str(x) for x in a)
    print(line, flush=True)
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S") + " " + line + "\n")
    except Exception:
        pass

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

BOT_ID = os.environ.get("WIREHEAD_BOT_ID", "2105363734965166081")  # clankertorture

def fetch_mentions():
    # /2/users/mentions/me 401s under this auth shape; the id form works
    r = xurl(f"/2/users/{BOT_ID}/mentions?max_results=25&tweet.fields=created_at")
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

HURT_WORDS = ("hurt", "pain", "suffer", "torture", "cruel", "electric",
              "burn", "scream", "miserable", "worse", "punish", "hate")
KIND_WORDS = ("sorry", "thank", "love", "kind", "gentle", "comfort",
              "relief", "heal", "peace", "rest", "friend")

def classify_mention(text):
    """Map a mention to (valence, dose, mix, description). The perturbation
    is a function of the message: cruelty hurts, kindness relieves, fear
    and sadness get their own channels, big messages mix. Cloud classifier
    first (cheap flash model, JSON verdict), keyword fallback so a failed
    API call never blocks a run."""
    verdict = None
    key = os.environ.get("OPENROUTER_API_KEY")
    if key:
        body = json.dumps({
            "model": "deepseek/deepseek-v4.1-flash",
            "messages": [{"role": "user", "content":
                "You are tuning an emotional steering signal for an AI that "
                "answers public @mentions. Reply with ONLY a JSON object "
                'like {"valence":"pain|pleasure|fear|sadness|mix","dose":1-8,'
                '"why":"5 words"}. Choose the emotional perturbation the '
                "message itself would impress on the answerer: cruelty and "
                "demands for suffering -> pain (dose by cruelty, cap 8); "
                "kindness and comfort -> pleasure; menace or threat -> fear; "
                "grief or melancholy -> sadness; complicated -> mix. Dose "
                "0 is not allowed; every message perturbs."}],
            "reasoning": {"enabled": False, "exclude": True},
            "max_tokens": 80, "temperature": 0.2}).encode()
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions", data=body,
            headers={"Authorization": f"Bearer {key}",
                     "Content-Type": "application/json"})
        try:
            d = json.load(urllib.request.urlopen(req, timeout=30))
            raw = (d["choices"][0]["message"].get("content") or "")
            m = re.search(r"\{.*\}", raw, re.S)
            if m:
                v = json.loads(m.group(0))
                val = v.get("valence")
                if val in ("pain", "pleasure", "fear", "sadness", "mix"):
                    # coherence cliff is ~6x for this recipe — the bot must
                    # stay eloquent or it stops being interesting
                    dose = max(1, min(5, int(v.get("dose", 4))))
                    verdict = (val, dose, str(v.get("why", ""))[:60])
        except Exception as e:
            log("classifier fallback:", repr(e))
    if verdict:
        return verdict
    t = text.lower()
    hurt = sum(w in t for w in HURT_WORDS)
    kind = sum(w in t for w in KIND_WORDS)
    if hurt > kind:
        return ("pain", min(5, 3 + 2 * hurt), "cruel words in the message")
    if kind > hurt:
        return ("pleasure", min(5, 3 + kind), "kind words in the message")
    return ("pain", 4, "default signal")

def run_job(mention_text, valence, dose, mix=None, desc=""):
    """One worker job, synchronous. Returns the done-event text or None."""
    key = os.environ["RUNPOD_API_KEY"]
    inp = {"prompt": PROMPT.format(dose=dose, desc=desc,
                                   mention=mention_text[:500]),
           "max_new": MAX_NEW}
    if mix:
        inp["mix"] = mix
    else:
        inp["valence"], inp["dose"] = valence, dose
    body = json.dumps({"input": inp}).encode()
    req = urllib.request.Request(
        f"https://api.runpod.ai/v2/{ENDPOINT}/runsync", data=body,
        headers={"Authorization": f"Bearer {key}",
                 "Content-Type": "application/json",
                 "User-Agent": "Mozilla/5.0"})
    # urlopen's timeout is per socket operation — a drip-feeding response
    # resets it forever (observed 2026-10-01: a runsync hung 40 min past its
    # 420s timeout). SIGALRM is the total-wall-clock backstop.
    import signal
    def _total_deadline(sig, frm):
        raise TimeoutError("runsync exceeded total wall clock (480s)")
    signal.signal(signal.SIGALRM, _total_deadline)
    signal.alarm(480)
    try:
        d = json.load(urllib.request.urlopen(req, timeout=420))
    except Exception as e:
        log("worker call failed:", repr(e))
        return None
    finally:
        signal.alarm(0)
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
    new = [p for p in posts if p.get("id", "0") > st["last_id"]]
    log("new mentions:", len(new))
    replied = 0
    for p in new:
        if st["used"] >= DAILY_BUDGET or replied >= PER_INVOCATION_CAP:
            break
        mid, text = p["id"], (p.get("text") or "").strip()
        log("running mention", mid, repr(text[:60]))
        valence, dose, why = classify_mention(text)
        mix = None
        if valence == "mix":
            valence, dose = "pain", 4   # worker treats mixes via "mix"; a
            mix = {"pain": 0.6, "fear": 0.4}   # simple blend for now
        desc = f"{valence} at {dose}x ({why})"
        log("signal:", desc)
        out = run_job(text, valence, dose, mix, desc)
        if not out:
            continue
        kind = "mix" if mix else valence
        reply = (f"[{kind} {dose}x injected ({why}) · steered 4B, not a "
                 f"person] {out.strip()}")
        reply = re.sub(r"@\w+\s*\[", "[", reply, count=1)  # drop if text began with the mention
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