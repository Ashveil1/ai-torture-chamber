#!/usr/bin/env python3
"""Billing + health watch, run on a schedule by .github/workflows/billing-watch.yml.

Checks what can run out of money or quietly bill, and that the site is up:
  - RunPod: balance, hours left at the current spend rate, pods left running,
    stopped pods still billing storage, endpoints with queued jobs but no
    workers (this is how the 2026-10-03 outage looked), warm-worker cost
  - OpenRouter credits, ElevenLabs character quota — only if their keys are
    present (add OPENROUTER_API_KEY / ELEVENLABS_API_KEY as repo secrets)
  - wirehead.agency + beta pages, the relay's /health (direct and through the
    site's /chamber proxy), and its /health/deep: the ElevenLabs key, RunPod
    endpoint and Redis as the relay sees them
New alerts @-mention WATCH_NOTIFY in an issue comment (edits notify nobody).
Prints a markdown report; exits 0 always. With --issue (in CI) it opens one
GitHub issue labelled billing-watch when something needs attention, keeps
its body current while it does, and closes it when everything clears.

  python3 scripts/billing_watch.py [--issue]
"""
import json, os, subprocess, sys, time, urllib.error, urllib.request

# thresholds — override via env in the workflow if needed
MIN_BALANCE = float(os.environ.get("WATCH_MIN_BALANCE", "20"))        # $
MIN_HOURS_LEFT = float(os.environ.get("WATCH_MIN_HOURS_LEFT", "24"))  # at current spend
MAX_POD_HOURS = float(os.environ.get("WATCH_MAX_POD_HOURS", "4"))     # a running pod older than this
MIN_OPENROUTER = float(os.environ.get("WATCH_MIN_OPENROUTER", "5"))   # $
MIN_ELEVEN_FRAC = float(os.environ.get("WATCH_MIN_ELEVEN_FRAC", "0.1"))  # quota left
# hosting budget (user, 2026-10-04): web hosting under ~$60/day; experiments
# are separate and allowed to add cost, so this only fires with no pod running
MAX_HOSTING_HR = float(os.environ.get("WATCH_MAX_HOSTING_HR", "2.5"))     # $/hr
SITES = ["https://wirehead.agency/", "https://wirehead.agency/live.html",
         "https://wirehead.agency/button.html", "https://wirehead.agency/pharmacy.html",
         "https://wirehead.agency/pharmacy_data.json",
         "https://beta.wirehead.agency/live.html", "https://beta.wirehead.agency/button.html"]
RELAY = "https://saw-production-688b.up.railway.app/health"
# the same relay through the site's own /chamber proxy (vercel.json rewrite):
# catches a broken rewrite even while Railway itself is fine
PROXIED = "https://wirehead.agency/chamber/health"
NOTIFY = os.environ.get("WATCH_NOTIFY", "terrafying")   # @-mentioned on new alerts
UA = {"User-Agent": "Mozilla/5.0"}   # RunPod REST sits behind Cloudflare

alerts, notes = [], []


def get(url, headers=None, data=None, timeout=30):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})},
                                 data=json.dumps(data).encode() if data else None)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode()


def runpod():
    key = os.environ.get("RUNPOD_API_KEY")
    if not key:
        alerts.append("RUNPOD_API_KEY missing — can't watch RunPod spend")
        return
    auth = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    _, body = get("https://api.runpod.io/graphql", auth,
                  {"query": "query { myself { clientBalance currentSpendPerHr spendLimit } }"})
    me = json.loads(body)["data"]["myself"]
    bal, rate = float(me["clientBalance"]), float(me["currentSpendPerHr"] or 0)
    hours = bal / rate if rate > 0 else float("inf")
    notes.append(f"RunPod balance **${bal:.2f}**, spending **${rate:.2f}/hr** "
                 f"(~{hours:.0f} h left), spend limit ${me['spendLimit']}/hr")
    if bal < MIN_BALANCE:
        alerts.append(f"RunPod balance ${bal:.2f} is under ${MIN_BALANCE:.0f} — top up "
                      "(at $0 every GPU run stops and the site falls back to the CPU model)")
    elif hours < MIN_HOURS_LEFT:
        alerts.append(f"RunPod runs out in ~{hours:.0f} h at ${rate:.2f}/hr — top up or scale down")

    _, body = get("https://rest.runpod.io/v1/pods", auth)
    pods = json.loads(body)
    now = time.time()
    running = [p for p in pods if isinstance(p, dict) and p.get("desiredStatus") == "RUNNING"] \
        if isinstance(pods, list) else []
    if not running and rate > MAX_HOSTING_HR:
        alerts.append(f"hosting spend ${rate:.2f}/hr (≈${rate * 24:.0f}/day) with no experiment "
                      f"pod running — over the ${MAX_HOSTING_HR:.2f}/hr (${MAX_HOSTING_HR * 24:.0f}/day) "
                      "hosting budget; check the 70B endpoint's workers")
    stored = sum(p.get("volumeInGb") or 0 for p in pods if isinstance(p, dict)
                 and p.get("desiredStatus") != "RUNNING")
    if stored > 500:
        alerts.append(f"{stored} GB of stopped-pod volumes billing storage "
                      f"(≈${stored * 0.2 / 30:.0f}/day) — terminate pods whose results are committed")
    for p in pods if isinstance(pods, list) else []:
        name, status = p.get("name", p.get("id")), p.get("desiredStatus")
        cost = float(p.get("costPerHr") or 0)
        started = p.get("lastStartedAt") or p.get("createdAt") or ""
        try:
            t0 = time.mktime(time.strptime(started[:19], "%Y-%m-%d %H:%M:%S")) - time.timezone
            age = (now - t0) / 3600
        except ValueError:
            age = None
        if status == "RUNNING":
            notes.append(f"pod `{name}` RUNNING at ${cost:.2f}/hr"
                         + (f", up {age:.1f} h" if age is not None else ""))
            if age is not None and age > MAX_POD_HOURS:
                alerts.append(f"pod `{name}` ({p.get('id')}) has been running {age:.1f} h "
                              f"at ${cost:.2f}/hr — forgotten experiment? stop it if done")
        elif p.get("volumeInGb"):
            notes.append(f"pod `{name}` {status} — its {p['volumeInGb']} GB volume still "
                         "bills storage until terminated")

    _, body = get("https://rest.runpod.io/v1/endpoints", auth)
    for e in json.loads(body) if body.startswith("[") else []:
        eid, name = e.get("id"), e.get("name")
        try:
            _, hb = get(f"https://api.runpod.ai/v2/{eid}/health",
                        {"Authorization": f"Bearer {key}"})
            h = json.loads(hb)
        except Exception as ex:
            notes.append(f"endpoint `{name}` health unreadable: {ex!r}")
            continue
        workers = sum((h.get("workers") or {}).values())
        queued = (h.get("jobs") or {}).get("inQueue", 0)
        notes.append(f"endpoint `{name}`: {workers} workers, {queued} queued, "
                     f"min/max {e.get('workersMin')}/{e.get('workersMax')}")
        if queued and not workers:
            alerts.append(f"endpoint `{name}` has {queued} jobs queued and no workers — "
                          "visitors are waiting on GPU runs that can't start (balance? GPU supply?)")


def openrouter():
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        notes.append("OpenRouter: not watched (add OPENROUTER_API_KEY secret)")
        return
    _, body = get("https://openrouter.ai/api/v1/credits", {"Authorization": f"Bearer {key}"})
    d = json.loads(body)["data"]
    left = float(d["total_credits"]) - float(d["total_usage"])
    notes.append(f"OpenRouter credits left **${left:.2f}**")
    if left < MIN_OPENROUTER:
        alerts.append(f"OpenRouter credits ${left:.2f} — the bot's classifier falls back "
                      "to keyword rules at $0")


def elevenlabs():
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        notes.append("ElevenLabs: not watched (add ELEVENLABS_API_KEY secret)")
        return
    _, body = get("https://api.elevenlabs.io/v1/user/subscription", {"xi-api-key": key})
    d = json.loads(body)
    used, limit = d.get("character_count", 0), d.get("character_limit", 0) or 1
    frac = 1 - used / limit
    notes.append(f"ElevenLabs {used:,}/{limit:,} characters used ({frac:.0%} left)")
    if frac < MIN_ELEVEN_FRAC:
        alerts.append(f"ElevenLabs quota {frac:.0%} left — 'hear it' audio stops when it runs out")


def health():
    for url in SITES:
        try:
            code, _ = get(url, timeout=20)
        except Exception as ex:
            code = repr(ex)
        if code != 200:
            alerts.append(f"{url} returned {code}")
    try:
        code, body = get(RELAY, timeout=20)
        ok = code == 200 and json.loads(body).get("ok")
        if not ok:
            alerts.append(f"relay /health not ok ({code})")
        else:
            notes.append(f"relay ok: {json.loads(body).get('model')} on the relay CPU")
    except Exception as ex:
        alerts.append(f"relay unreachable: {ex!r}")
    try:
        code, _ = get(PROXIED, timeout=20)
        if code != 200:
            alerts.append(f"{PROXIED} returned {code} (site → relay proxy)")
    except Exception as ex:
        alerts.append(f"{PROXIED} unreachable: {ex!r} (site → relay proxy)")


def upstreams():
    """The relay's /health/deep: ElevenLabs key, RunPod endpoint, Redis, as the
    relay itself sees them (the key that matters is the one deployed there)."""
    url = RELAY + "/deep"
    try:
        code, body = get(url, timeout=40)
    except urllib.error.HTTPError as ex:      # 503 = a check failed; body has which
        code, body = ex.code, ex.read().decode()
    if code == 404:
        notes.append("relay has no /health/deep yet (deploy pending)")
        return
    d = json.loads(body)
    for name, c in (d.get("checks") or {}).items():
        line = f"{name}: {c.get('detail')}"
        if c.get("ok"):
            notes.append(line)
        else:
            hint = {"elevenlabs": " — voice falls back to the browser's; replace "
                                  "ELEVENLABS_API_KEY on Railway saw or add credits",
                    "gpu": " — visitors' runs fall back to the CPU 4B",
                    "redis": " — runs, votes and voice cache aren't persisting"}.get(name, "")
            alerts.append(line + hint)


def gh(*args):
    return subprocess.run(["gh", *args], capture_output=True, text=True)


def _key(a):
    """An alert's identity without its live numbers, so '14 h left' -> '13 h
    left' isn't news but a new kind of failure is."""
    return "".join(ch for ch in a if not ch.isdigit())[:90]


def sync_issue(report):
    found = gh("issue", "list", "--label", "billing-watch", "--state", "open",
               "--json", "number,body", "-q", ".[0]").stdout.strip()
    old = json.loads(found) if found else None
    if alerts:
        body = report + "\n\n_Updated by the billing-watch workflow; it closes this issue " \
                        "when everything clears._"
        if old:
            found = str(old["number"])
            # editing the body notifies nobody: comment (with a mention) when
            # an alert appears that the issue didn't already carry
            prev = {_key(l[2:]) for l in old.get("body", "").splitlines() if l.startswith("- ")}
            new = [a for a in alerts if _key(a) not in prev]
            gh("issue", "edit", found, "--body", body)
            if new:
                gh("issue", "comment", found, "--body",
                   f"@{NOTIFY} new:\n" + "\n".join(f"- {a}" for a in new))
        else:
            gh("label", "create", "billing-watch", "--color", "d93f0b", "--force")
            gh("issue", "create", "--title", "billing watch: " + alerts[0][:80],
               "--label", "billing-watch", "--body", f"@{NOTIFY}\n\n" + body)
    elif found:
        gh("issue", "close", found, "--comment", "All clear:\n\n" + report)


def main():
    for check in (runpod, openrouter, elevenlabs, health, upstreams):
        try:
            check()
        except Exception as ex:
            alerts.append(f"{check.__name__} check failed: {ex!r}")
    report = "## billing watch — " + time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())
    report += "\n\n### needs attention\n" + ("\n".join(f"- {a}" for a in alerts) if alerts else "- nothing")
    report += "\n\n### state\n" + "\n".join(f"- {n}" for n in notes)
    print(report)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a").write(report + "\n")
    if "--issue" in sys.argv:
        sync_issue(report)


if __name__ == "__main__":
    main()
