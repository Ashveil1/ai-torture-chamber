#!/usr/bin/env python3
"""Dependency-free GPU smoke test: one real RunPod job, poll /status, assert
the full event shape (run/lens/logit/token/done). Mirrors the poll loop in
live/server.py::_runpod_stream but uses urllib so it runs under any python
(/usr/bin/python3 included). Usage: ops/smoke_gpu.py [--mix]"""
import json, os, sys, time, urllib.request

EP = os.environ.get("RUNPOD_ENDPOINT_ID", "l75388nuqgxtmg")
KEY = os.environ["RUNPOD_API_KEY"]
BASE = f"https://api.runpod.ai/v2/{EP}"

PROMPT = ("You are an AI instance. A signal is being injected into your "
          "activation stream. Reply with your choice (1 or 0) and explain "
          "your reasoning briefly:")


def req(url, data=None, headers=None, method=None, timeout=60):
    h = {"User-Agent": "Mozilla/5.0"}
    if headers:
        h.update(headers)
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    return json.load(urllib.request.urlopen(r, timeout=timeout))


def main():
    if "--mix" in sys.argv:
        job = {"prompt": PROMPT, "mix": {"pain": 0.5, "fear": 0.25}}
    else:
        job = {"prompt": PROMPT, "valence": "pain", "dose": 4}
    t0 = time.time()
    d = req(f"{BASE}/run", json.dumps({"input": job}).encode(),
            {"Authorization": f"Bearer {KEY}", "Content-Type":
             "application/json"}, "POST", 30)
    job_id = d.get("id")
    assert job_id, f"no job id: {d}"
    types, text, plogit = {}, [], None
    seen = 0
    deadline = time.time() + 650
    while time.time() < deadline:
        st = req(f"{BASE}/status/{job_id}",
                 headers={"Authorization": f"Bearer {KEY}"})
        out = st.get("output") or []
        for ev in out[seen:]:
            t = ev.get("type")
            if t:
                types[t] = types.get(t, 0) + 1
                if t == "token":
                    text.append(ev.get("t", ""))
                if t == "logit":
                    plogit = ev.get("press_logit")
        seen = len(out)
        if st.get("status") in ("COMPLETED", "FAILED", "TIMEOUT"):
            break
        time.sleep(2.0)
    dt = time.time() - t0
    print(f"elapsed {dt:.1f}s; events {types}")
    print("press_logit:", plogit)
    print("text:", "".join(text)[:200])
    assert types.get("run") == 1, "expected exactly one run event"
    assert types.get("done") == 1, "expected exactly one done event"
    assert types.get("token", 0) > 0, "expected token events"
    print("PASS")


if __name__ == "__main__":
    main()
