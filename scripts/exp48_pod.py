#!/usr/bin/env python3
"""Run exp48 on a RunPod GPU pod: smoke -> full (Qwen3-4B, the pre-registered
run) -> replication on a larger model. Results are served read-only over the
pod's HTTP proxy at https://<pod>-8000.proxy.runpod.net/ so they can be
fetched with curl; the pod is then stopped (not terminated) by hand.

  python3 scripts/exp48_pod.py [--big Qwen/Qwen3-14B] [--gpu "NVIDIA RTX A6000"]
Needs RUNPOD_API_KEY in ~/.hermes/.env. Same REST v1 shape as runpod_deploy.py.
"""
import argparse, json, pathlib, sys, urllib.error, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument("--big", default="Qwen/Qwen3-14B")
ap.add_argument("--gpu", default="NVIDIA RTX A6000")
args = ap.parse_args()

key = [l.split("=", 1)[1].strip() for l in open(pathlib.Path.home() / ".hermes/.env")
       if l.startswith("RUNPOD_API_KEY=")][0]
H = {"Authorization": f"Bearer {key}", "Content-Type": "application/json",
     "User-Agent": "Mozilla/5.0"}  # urllib default UA gets Cloudflare 1010
REPO_URL = "https://github.com/terrafying/ai-torture-chamber.git"
assert " " not in REPO_URL and REPO_URL.endswith(".git"), REPO_URL

BOOTSTRAP = r"""
set -uo pipefail
log(){ echo "[exp48 $(date +%H:%M:%S)] $*"; }
command -v git >/dev/null || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git; }
cd /workspace && rm -rf repo && git clone -q --depth 1 {REPO_URL} repo && cd repo || exit 1
mkdir -p runs/exp48
# serve results from the start, so progress is visible while it runs
(cd runs/exp48 && python -m http.server 8000 >/dev/null 2>&1 &)
log "deps"
pip install -q --no-cache-dir 'torch==2.8.0' --index-url https://download.pytorch.org/whl/cu128 > runs/exp48/pip.log 2>&1
pip install -q --no-cache-dir 'transformers==5.17.0' numpy accelerate >> runs/exp48/pip.log 2>&1
python -c "import torch; assert torch.cuda.is_available(); print(torch.__version__, torch.cuda.get_device_name())" > runs/exp48/env.txt 2>&1 || { log "no CUDA"; sleep infinity; }
export HF_HOME=/workspace/hf
log "smoke";  python exp48_emotion_binding.py --smoke --device cuda > runs/exp48/smoke_gpu.log 2>&1
log "full 4B"; python exp48_emotion_binding.py --device cuda > runs/exp48/full.log 2>&1
log "big {BIG}"; python exp48_emotion_binding.py --device cuda --model {BIG} > runs/exp48/big.log 2>&1
log "done"; touch runs/exp48/ALL_DONE
sleep infinity
""".replace("{REPO_URL}", REPO_URL).replace("{BIG}", args.big)

def rest(method, path, body=None):
    req = urllib.request.Request(f"https://rest.runpod.io/v1/{path}",
                                 data=json.dumps(body).encode() if body else None,
                                 headers=H, method=method)
    try:
        raw = urllib.request.urlopen(req, timeout=60).read().decode()
        return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} on {method} {path}: {e.read().decode()[:1200]}")

pod = rest("POST", "pods", {
    # REST v1 PodCreateInput (schema: https://rest.runpod.io/v1/openapi.json)
    "name": "exp48-emotion-binding",
    "imageName": "pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime",
    "gpuTypeIds": [args.gpu, "NVIDIA L40S"], "gpuTypePriority": "custom",
    "gpuCount": 1, "cloudType": "SECURE",
    "ports": ["8000/http"], "volumeInGb": 80, "volumeMountPath": "/workspace",
    "containerDiskInGb": 40, "env": {"HF_HOME": "/workspace/hf"},
    "dockerEntrypoint": ["/bin/bash", "-c"], "dockerStartCmd": [BOOTSTRAP],
})
pid = pod.get("id")
pathlib.Path("runs/exp48").mkdir(parents=True, exist_ok=True)
pathlib.Path("runs/exp48/pod.json").write_text(json.dumps(pod, indent=1))
print("pod", pid, pod.get("desiredStatus"), "cost/hr", pod.get("costPerHr"))
print(f"results: https://{pid}-8000.proxy.runpod.net/")
