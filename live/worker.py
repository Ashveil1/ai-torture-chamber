"""RunPod serverless worker: stateless generation jobs for the Saw chamber.

Splits the old all-in-one server.py: the endless shared cycle, SSE fanout,
history and scoreboard stay on the always-on CPU relay (Railway). This
worker owns only the model: one job = one run.

Job input:
  {"prompt": str,                      # full prompt (relay composes it)
   "valence": "pain"|..., "dose": 0-8, # single-vector mode, or
   "mix": {"pain": 0.5, ...},          # mix mode (see server.set_mix_vec)
   "max_new": int?}                    # optional token cap override

Streamed output events (yielded; surfaced via the endpoint's /stream):
  {"type": "run",   ...meta}
  {"type": "lens",  "tokens": [...]}       (None-omitted if lens absent)
  {"type": "logit", "press_logit": float}
  {"type": "token", "t": chunk}
  {"type": "done",  "truncated": false}
"""
import json, os, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import runpod
import server  # the chamber's model machinery: _state, set_vec, streams

import torch

DTYPE_OVERRIDE = {"float32": torch.float32, "bfloat16": torch.bfloat16,
                  "float16": torch.float16}[
    os.environ.get("CHAMBER_DTYPE", "float16")]
server.DTYPE = DTYPE_OVERRIDE      # GPU pods run fp16; server.py defaults bf16

_loaded = {"ready": False}

def _ensure_loaded():
    if _loaded["ready"]:
        return
    server.startup()               # loads model, builds vectors, hook, lens
    _loaded["ready"] = True

def _validate(body):
    if not isinstance(body, dict):
        raise ValueError("job input must be an object")
    prompt = body.get("prompt")
    if not isinstance(prompt, str) or not (1 <= len(prompt) <= 4000):
        raise ValueError("prompt must be text under 4000 chars")
    mix = body.get("mix")
    weights = None
    if mix is not None:
        weights, err = server.parse_mix(mix)
        if err:
            raise ValueError(err)
    else:
        valence = body.get("valence", "none")
        if valence not in server.MIX_KEYS:
            raise ValueError("valence must be one of "
                             + ", ".join(server.MIX_KEYS))
        dose = int(body.get("dose", 4))
        dose = max(0, min(8, dose))
        body["valence"], body["dose"] = valence, dose
    if body.get("max_new") is not None:
        server.MAX_NEW = int(body["max_new"])
    return prompt, weights, mix is not None

def handler(job):
    """One generation. Streams events; never raises after load (errors are
    events so the relay can show them)."""
    _ensure_loaded()
    body = job.get("input") or {}
    try:
        prompt, weights, is_mix = _validate(body)
    except ValueError as e:
        yield {"type": "error", "e": str(e)}
        return

    meta = {"prompt": prompt}
    try:
        if is_mix:
            info = server.set_mix_vec(weights)
            meta.update(valence="mix", mix=info["mix"],
                        weights=info["weights"], dose=info["dose"])
        else:
            server.set_vec((body["valence"], body["dose"]))
            meta.update(valence=body["valence"], dose=body["dose"])
    except Exception as e:
        yield {"type": "error", "e": "steering failed: %r" % e}
        return

    yield {"type": "run", **meta}
    loop = None  # worker is sync; server.py's helpers are thread-safe here
    try:
        lens_toks = server.lens_readback(prompt)
        if lens_toks is not None:
            yield {"type": "lens", "tokens": lens_toks}
        yield {"type": "logit", "press_logit": server.press_logit(prompt)}
        parts = []
        for chunk in server.stream_generate(prompt):
            if chunk:
                parts.append(chunk)
                yield {"type": "token", "t": chunk}
        yield {"type": "done", "truncated": False,
               "text": "".join(parts), "ts": time.time()}
    except Exception as e:
        yield {"type": "error", "e": str(e)}
    finally:
        server.set_vec(None)

runpod.serverless.start({"handler": handler,
                         "return_aggregate_stream": True})
