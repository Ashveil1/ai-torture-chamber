"""Found-footage video from a shot list: Blender renders of the game's floors (or existing game
captures), a VHS finish, a sound bed, voice lines, music, and tape cuts between shots.

    python scripts/video/make_video.py scripts/video/shots/backrooms_demo.json

Shot list:
    {"title": "backrooms_demo", "out": "video/out", "music": "video/music/drone.mp3",
     "tape_start": "2026-10-08 02:13:05", "vhs_strength": 1.0,
     "shots": [
        {"scene": "floor7", "shot": "scripts/video/shots/underpass_walk.json"},     # rendered in Blender
        {"clip": "video/captures/clinic.mp4", "in": 9.4, "dur": 6},                 # an existing capture
        {"card": "THE ELEVATOR IS BROKEN", "dur": 2},                               # a black card
        ...],
     "voice": [{"at": 4.0, "text": "Is somebody there?", "valence": "fear", "dose": 3}]}

Scenes are exported on demand (export_floor.py) from --base. Music is any audio file you put in
video/music (a Suno track, an ACE-Step drone); without it the bed is room tone and tube hum.
"""
import argparse
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"
FONT = "/System/Library/Fonts/Menlo.ttc"


def run(cmd, **kw):
    r = subprocess.run(cmd, **kw)
    if r.returncode:
        sys.exit(f"failed: {' '.join(map(str, cmd))[:300]}")


def ff(*a):
    run(["ffmpeg", "-v", "error", "-y", *map(str, a)])


def dur(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                capture_output=True, text=True).stdout or 0)


def blender_shot(spec, work, base):
    scene = work / "scenes" / f"{spec['scene']}.glb"
    if not scene.exists():
        run([sys.executable, str(HERE / "export_floor.py"), spec["scene"], "--base", base, "--out", str(scene.parent)])
    frames = work / "renders" / Path(spec["shot"]).stem
    if not (frames / "frame_0001.png").exists() or spec.get("rerender"):
        run([BLENDER, "-b", "-P", str(HERE / "blender_shot.py"), "--", "--scene", str(scene), "--shot", str(ROOT / spec["shot"]), "--out", str(frames)],
            stdout=subprocess.DEVNULL)
    fps = json.loads((ROOT / spec["shot"]).read_text()).get("fps", 30)
    out = work / "clips" / f"{frames.name}.mp4"
    ff("-framerate", fps, "-i", frames / "frame_%04d.png", "-c:v", "libx264", "-crf", 16, "-pix_fmt", "yuv420p", out)
    return out


def card(text, d, out):
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new("RGB", (640, 480), (2, 2, 3)); g = ImageDraw.Draw(im); f = ImageFont.truetype(FONT, 24, index=1)
    for k, line in enumerate(text.split("\n")):
        fk = f
        while g.textlength(line, font=fk) > 600 and fk.size > 10: fk = ImageFont.truetype(FONT, fk.size - 1, index=1)
        w = g.textlength(line, font=fk); f2 = fk; g.text(((640 - w) / 2, 220 + k * 34 - 17 * (text.count("\n"))), line, font=f2, fill=(220, 210, 190))
    png = out.with_suffix(".png"); im.save(png)
    ff("-loop", 1, "-t", d, "-i", png, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", 16, out)
    return out


def bed(seconds, out):
    """Room tone and the tubes: brown noise, a 60 Hz mains hum with its 120 Hz buzz, a slow flutter."""
    ff("-f", "lavfi", "-i", f"anoisesrc=color=brown:amplitude=0.05:d={seconds}",
       "-f", "lavfi", "-i", f"sine=f=120:d={seconds}", "-f", "lavfi", "-i", f"sine=f=240:d={seconds}", "-f", "lavfi", "-i", f"sine=f=60:d={seconds}",
       "-filter_complex", "[1]volume=0.035,tremolo=f=0.3:d=0.5[a];[2]volume=0.012[b];[3]volume=0.03[c];[0]lowpass=f=900[n];[n][a][b][c]amix=inputs=4:normalize=0,volume=1.6",
       "-ar", 48000, "-ac", 2, out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("shotlist")
    ap.add_argument("--base", default="http://localhost:8731", help="where the game is served, for scene export")
    ap.add_argument("--work", type=Path, default=ROOT / "video")
    a = ap.parse_args()
    L = json.loads(Path(a.shotlist).read_text())
    work = a.work; [(work / d).mkdir(parents=True, exist_ok=True) for d in ("scenes", "renders", "clips", "out")]
    title = L.get("title", Path(a.shotlist).stem)

    # 1. every shot as a plain clip
    plain = []
    for i, s in enumerate(L["shots"]):
        o = work / "clips" / f"{title}_{i:02d}.mp4"
        if "scene" in s:
            src = blender_shot(s, work, a.base)
            ff("-i", src, "-t", s.get("dur", dur(src)), "-an", "-c:v", "libx264", "-crf", 16, o)
        elif "clip" in s:
            ff("-ss", s.get("in", 0), "-t", s["dur"], "-i", ROOT / s["clip"], "-an", "-c:v", "libx264", "-crf", 16, "-vf", "fps=30,format=yuv420p", o)
        else:
            card(s["card"], s.get("dur", 2), o)
        plain.append((o, s))

    # 2. tape: each shot through the VHS pass (cards stay clean), with a burst of tape noise at each cut
    # one tape: the camcorder clock runs on across shots (a shot can jump it with "clock": "2026-10-08 03:40:00")
    import datetime as dt
    clock = dt.datetime.strptime(L.get("tape_start", "2026-10-08 02:13:05"), "%Y-%m-%d %H:%M:%S")
    taped = []
    for i, (o, s) in enumerate(plain):
        if s.get("clock"):
            clock = dt.datetime.strptime(s["clock"], "%Y-%m-%d %H:%M:%S")
        t = o.with_name(o.stem + "_vhs.mp4")
        if "card" in s:
            ff("-i", o, "-vf", "scale=640:480,setsar=1,format=yuv420p", "-r", 29.97, "-c:v", "libx264", "-crf", 16, t)
        else:
            run([sys.executable, str(HERE / "vhs.py"), str(o), str(t), "--start", clock.strftime("%Y-%m-%d %H:%M:%S"),
                 "--strength", str(L.get("vhs_strength", 1.0))] + ([] if s.get("osd", True) else ["--no-osd"]))
        taped.append(t); clock += dt.timedelta(seconds=dur(o))
        if i < len(plain) - 1 and L.get("cut_noise", True):
            n = o.with_name(o.stem + "_cut.mp4")
            ff("-f", "lavfi", "-i", "nullsrc=s=640x480:r=29.97:d=0.2", "-vf", "geq=lum='255*random(1)':cb=128:cr=128,format=yuv420p", "-c:v", "libx264", n)
            taped.append(n)
    lst = work / "clips" / f"{title}_list.txt"
    lst.write_text("".join(f"file '{p.resolve()}'\n" for p in taped))
    picture = work / "clips" / f"{title}_picture.mp4"
    ff("-f", "concat", "-safe", 0, "-i", lst, "-c:v", "libx264", "-crf", 17, "-pix_fmt", "yuv420p", picture)
    T = dur(picture)

    # 3. sound: the bed, then music, then voices at their cue times
    # input 0 is the picture; audio inputs count from 1
    inputs, mix = ["-i", bed(T, work / "clips" / f"{title}_bed.wav")], ["[1]"]
    if L.get("music") and (ROOT / L["music"]).exists():
        inputs += ["-i", str(ROOT / L["music"])]; mix.append(f"[{len(inputs) // 2}]")
    filters = []
    if len(mix) == 2:
        filters.append(f"{mix[1]}volume={L.get('music_gain', 0.6)},afade=t=out:st={max(0, T - 3)}:d=3[m]"); mix[1] = "[m]"
    # voices: the site's TTS through the game's own chain (voice.py: autotune, numbers station, the room)
    import asyncio
    sys.path.insert(0, str(HERE)); from voice import render_lines
    cues = L.get("voice", [])
    wavs = [work / "clips" / f"{title}_voice{k}.wav" for k in range(len(cues))]
    todo = [(v["text"], v.get("valence", "pain"), v.get("dose", 3), v.get("place"), str(w)) for v, w in zip(cues, wavs) if not w.exists() or v.get("redo")]
    if todo:
        asyncio.run(render_lines(todo, a.base))
    for k, (v, wav) in enumerate(zip(cues, wavs)):
        inputs += ["-i", str(wav)]; idx = len(inputs) // 2
        filters.append(f"[{idx}]adelay={int(v['at'] * 1000)}:all=1,volume={v.get('gain', 2.2)}[v{k}]"); mix.append(f"[v{k}]")
    filters.append(f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0:duration=first,alimiter=limit=0.9[aout]")
    final = work / "out" / f"{title}.mp4"
    ff("-i", picture, *inputs, "-filter_complex", ";".join(filters), "-map", "0:v", "-map", "[aout]", "-t", T,
       "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final)
    print(f"{final}  {T:.1f}s")


if __name__ == "__main__":
    main()
