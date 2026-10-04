# worker_llama — the single-layer steered worker

One model, one steering mechanism: Qwen3-32B under llama.cpp with control
vectors. The bot's transcript IS the reply; the qwen3-30b voice layer drops
to fallback-only.

## Why the 32B

- exp50 (bigger models): 32B steers cleanly and stays fluent; 4B/70B loop at 6.
- claude's exp56 on the 32B: theme directions push with real effect sizes at
  6/8x, coherence holds to 8x (repetition <= 0.13), doses 2/4 under-steer.
- 3B-active MoE alternative (30B-A3B) was the original pick; the 32B dense
  model has all the evidence, so the worker defaults to it. The extraction
  script (exp56_cvector_extract.py) can produce cvector GGUFs for either.

## Dose mapping

The bot sends dose 0-5 (chamber scale, 1x = neutral_norm/4). On the 32B that
scale under-steers (exp56), so the worker applies:

    llama.cpp strength = dose * DOSE_GAIN (default 1.5) * CHAMBER_SCALE

CHAMBER_SCALE comes from exp56_meta.json (scale_factor = mean neutral
last-token norm / 4, the chamber's 1x unit). DOSE_GAIN=1.5 puts bot dose 4
at effective 6x — the held band. Calibrate on the first real transcripts
and adjust; coherence cutoff observed at 8x on the 32B.

## Contract

Same as the existing transformers worker (live/worker.py): input
{prompt, chat, system, rep_penalty, max_new, valence|mix, dose}; output
events ending {"type": "done", "text": ...}. Mixes are approximated by the
dominant valence at blended strength (llama.cpp takes one scaled vector per
flag; a true multi-vector mix is a llama.cpp upgrade if the bot needs it).

## Cold start

llama-cli reloads the 18GB Q4 per job (~60-90s); the bot's JOB_DEADLINE is
480s and its budget is <=6 jobs/day, so per-job reload is acceptable and
keeps the worker stateless. If volume justifies it, move to llama-server
with per-request control vectors (llama.cpp feature request) or one server
per valence behind a router.

## Deploy

Needs the cvector GGUFs from the private HF repo (built by
exp56_cvector_extract.py on an 80GB pod — RunPod balance required) and a
RunPod serverless endpoint created from this image. Then point the bot's
WIREHEAD_ENDPOINT at it and set DOSE_GAIN after the first calibration run.
