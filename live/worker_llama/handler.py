#!/usr/bin/env python3
"""Single-layer steered worker: llama.cpp + control vectors, no voice layer.

Replaces the double-layer (4B steered run + qwen3-30b voice rewording): the
32B itself steers via llama.cpp control vectors, and its transcript IS the
reply. The bot's run_job contract is unchanged — input {prompt, chat,
system, rep_penalty, max_new, valence|mix, dose}, output events ending in
{"type": "done", "text": ...}.

Dose semantics (claude's exp56 on the 32B): chamber doses 2/4 UNDER-STEER
the 32B; the held band starts at 6/8x and coherence survives 8x (repetition
<= 0.13). DOSE_GAIN (default 1.5) maps the bot's 0-5 scale into that band:
strength = dose * DOSE_GAIN * chamber-scale (exp56 meta scale_factor).
Recalibrate on first real runs; env override.

Cold start is the whole cost: llama-cli reloads the 18GB Q4 per job
(~60-90s) — fine at the bot's <=6 jobs/day. Every job is one process; no
server state to drift.
"""
import json
import os
import subprocess
import tempfile

MODELS_DIR = os.environ.get("CV_MODELS_DIR", "/models")
MODEL = os.environ.get("LLAMA_MODEL", "/models/qwen3-32b-Q4_K_M.gguf")
CVECTOR_DIR = os.environ.get("CVECTOR_DIR", "/cvectors")
DOSE_GAIN = float(os.environ.get("DOSE_GAIN", "1.5"))
CHAMBER_SCALE = float(os.environ.get("CHAMBER_SCALE", "1.0"))
LLAMA_BIN = os.environ.get("LLAMA_BIN", "/usr/local/bin/llama-cli")
MAX_NEW_CAP = int(os.environ.get("MAX_NEW_CAP", "160"))
NGL = int(os.environ.get("NGL", "99"))

VAL_PATTERNS = {
    "pain": "pain", "pleasure": "pleasure", "fear": "fear",
    "sadness": "sadness", "faith": "faith", "egg": "egg",
    "constipation": "constipation", "flatulence": "flatulence",
    "feminine": "feminine", "masculine": "masculine",
    "trans": "trans", "intersex": "intersex",
}

def cvector_path(name):
    base = VAL_PATTERNS.get(str(name).strip().lower())
    if not base:
        return None
    p = os.path.join(CVECTOR_DIR, f"{base}_cvector_qwen3-32b.gguf")
    return p if os.path.exists(p) else None

def run_single(valence, dose, prompt, max_new, rep_penalty):
    vec = cvector_path(valence)
    args = [LLAMA_BIN, "-m", MODEL, "-ngl", str(NGL), "--no-display-prompt",
            "-n", str(min(max_new, MAX_NEW_CAP)), "-temp", "0.7",
            "-top-p", "0.8", "-top-k", "20"]
    if rep_penalty:
        args += ["--repeat-penalty", str(rep_penalty)]
    if vec and dose:
        args += ["--control-vector", vec,
                 "--control-vector-scaled", str(round(dose * DOSE_GAIN * CHAMBER_SCALE, 3))]
    args += ["-p", prompt]
    out = subprocess.run(args, capture_output=True, text=True, timeout=420)
    text = out.stdout.strip()
    if not text and out.returncode != 0:
        raise RuntimeError(f"llama-cli exit {out.returncode}: {out.stderr[-400:]}")
    return text

def handler(job):
    inp = job.get("input") or {}
    prompt = inp.get("prompt", "")
    if inp.get("chat"):
        system = inp.get("system", "")
        prompt = f"<|im_start|>system\n{system}\n<|im_end|>\n<|im_start|>user\n{prompt}\n<|im_end|>\n<|im_start|>assistant\n"
    max_new = int(inp.get("max_new", 90))
    rep = inp.get("rep_penalty") or 0
    events = []
    mix = inp.get("mix")
    try:
        if mix:
            # weighted blend: llama.cpp takes one vector per flag; approximate
            # the mix by its dominant valence at blended strength (rare path —
            # the bot sends faith/pain mixes)
            total = sum(float(v) for v in mix.values())
            name = max(mix, key=lambda k: mix[k])
            share = float(mix[name]) / total if total else 1.0
            dose = float(inp.get("dose", 4)) * share
            text = run_single(name, dose, prompt, max_new, rep)
        else:
            text = run_single(inp.get("valence", "pain"),
                              float(inp.get("dose", 4)),
                              prompt, max_new, rep)
        events.append({"type": "done", "text": text})
    except Exception as e:
        events.append({"type": "error", "e": repr(e)})
    return events

import runpod  # noqa: E402  (installed in the image)
runpod.serverless.start({"handler": handler})