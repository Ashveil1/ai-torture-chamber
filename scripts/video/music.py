"""Music for the video pipeline from ACE-Step 1.5, run locally through ComfyUI (/Volumes/evol/comfy,
started with `.venv/bin/python main.py`). Writes video/music/<name>.mp3 for make_video.py's "music".

    python scripts/video/music.py drone --seconds 90 --tags "dark ambient drone, liminal, fluorescent hum, ..."
    python scripts/video/music.py drone --seed 7          # another take

A Suno track does the same job: save it as video/music/<name>.mp3.
"""
import argparse
import json
import shutil
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
HOST = "http://127.0.0.1:8188"
COMFY_OUT = Path("/Volumes/evol/comfy/output")
DEFAULT_TAGS = ("dark ambient drone, liminal space, fluorescent hum, distant muffled elevator music heard through a wall, "
                "detuned, tape warble, slow, sparse, no drums, found-footage horror, instrumental")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name"); ap.add_argument("--seconds", type=int, default=90); ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--tags", default=DEFAULT_TAGS); ap.add_argument("--bpm", type=int, default=60); ap.add_argument("--key", default="E minor")
    ap.add_argument("--out", type=Path, default=ROOT / "video" / "music")
    a = ap.parse_args()
    wf = json.loads((HERE / "comfy" / "ace_step_t2a_api.json").read_text())
    wf["5"]["inputs"].update(tags=a.tags, seed=a.seed, bpm=a.bpm, duration=a.seconds, keyscale=a.key)
    wf["7"]["inputs"]["seconds"] = a.seconds; wf["8"]["inputs"]["seed"] = a.seed
    wf["10"]["inputs"]["filename_prefix"] = f"wf_{a.name}"
    try:
        r = urllib.request.urlopen(urllib.request.Request(HOST + "/api/prompt", json.dumps({"prompt": wf}).encode(), {"Content-Type": "application/json"}))
    except OSError:
        sys.exit("ComfyUI isn't running: cd /Volumes/evol/comfy && .venv/bin/python main.py")
    pid = json.load(r)["prompt_id"]; print("queued", pid, flush=True)
    while True:
        time.sleep(4)
        h = json.load(urllib.request.urlopen(f"{HOST}/api/history/{pid}"))
        if pid in h:
            v = h[pid]
            if v["status"]["status_str"] != "success":
                sys.exit(json.dumps(v["status"])[:1500])
            for node in v["outputs"].values():
                for it in node.get("audio", []):
                    src = COMFY_OUT / it.get("subfolder", "") / it["filename"]
                    a.out.mkdir(parents=True, exist_ok=True); dst = a.out / f"{a.name}.mp3"; shutil.copy(src, dst); print(dst)
            return


if __name__ == "__main__":
    main()
