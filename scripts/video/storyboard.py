"""Storyboard a shot list: three frames per shot (start, middle, end), the shot number, its length
and its note, one row per shot, so the blocking can be judged before anything is fully rendered.

    python scripts/video/storyboard.py scripts/video/shots/the_tape.json --work video
    python scripts/video/storyboard.py scripts/video/shots/the_tape.json --only 3,7     # re-board some shots

Blender shots render just those three frames; game captures give three grabs; cards are drawn.
Writes <work>/out/<title>_board.jpg.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"
FONT = "/System/Library/Fonts/Menlo.ttc"
TW, TH = 320, 240


def frames_for(i, s, work, base, redo):
    d = work / "board" / f"shot_{i:02d}"; d.mkdir(parents=True, exist_ok=True)
    have = sorted(d.glob("still_*.png"))
    if len(have) == 3 and not redo:
        return have
    if "scene" in s:
        scene = work / "scenes" / f"{s['scene']}.glb"
        if not scene.exists():
            subprocess.run([sys.executable, str(HERE / "export_floor.py"), s["scene"], "--base", base, "--out", str(scene.parent)], check=True)
        subprocess.run([BLENDER, "-b", "-P", str(HERE / "blender_shot.py"), "--", "--scene", str(scene), "--shot", str(ROOT / s["shot"]),
                        "--out", str(d), "--stills", "0,0.5,1"], check=True, stdout=subprocess.DEVNULL)
    elif "clip" in s:
        for k, f in enumerate((0.05, 0.5, 0.95)):
            t = s.get("in", 0) + f * s["dur"]
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(ROOT / s["clip"]), "-frames:v", "1", str(d / f"still_{k}.png")], check=True)
    else:
        for k in range(3):
            im = Image.new("RGB", (TW, TH), (2, 2, 3)); g = ImageDraw.Draw(im); f = ImageFont.truetype(FONT, 15, index=1)
            for j, line in enumerate(s["card"].split("\n")):
                fj = f
                while g.textlength(line, font=fj) > TW - 24 and fj.size > 8: fj = ImageFont.truetype(FONT, fj.size - 1, index=1)
                g.text(((TW - g.textlength(line, font=fj)) / 2, TH / 2 - 10 + j * 20), line, font=fj, fill=(220, 210, 190))
            im.save(d / f"still_{k}.png")
    return sorted(d.glob("still_*.png"))


def shot_seconds(s):
    if "scene" in s:
        return s.get("dur") or json.loads((ROOT / s["shot"]).read_text())["seconds"]
    return s.get("dur", 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("shotlist")
    ap.add_argument("--base", default="http://localhost:8731")
    ap.add_argument("--work", type=Path, default=ROOT / "video")
    ap.add_argument("--only", default="", help="comma-separated shot numbers to re-render")
    a = ap.parse_args()
    L = json.loads(Path(a.shotlist).read_text())
    only = {int(x) for x in a.only.split(",") if x}
    title = L.get("title", Path(a.shotlist).stem)
    rows, t = [], 0.0
    for i, s in enumerate(L["shots"]):
        st = frames_for(i, s, a.work, a.base, i in only)
        rows.append((i, s, st, t)); t += shot_seconds(s)
        print(f"shot {i}: {s.get('note', s.get('card', ''))[:60]}", flush=True)
    W, pad, side = 3 * TW + 4 * 8, 8, 300
    board = Image.new("RGB", (W + side, len(rows) * (TH + pad) + 70), (14, 13, 12))
    g = ImageDraw.Draw(board); fb, fs = ImageFont.truetype(FONT, 22, index=1), ImageFont.truetype(FONT, 13, index=0)
    g.text((pad, 18), f"{title.upper()}  ·  {len(rows)} shots  ·  {t:.0f} s", font=fb, fill=(224, 74, 58))
    for r, (i, s, st, t0) in enumerate(rows):
        y = 60 + r * (TH + pad)
        for k, p in enumerate(st[:3]):
            im = Image.open(p).convert("RGB"); im.thumbnail((TW, TH)); board.paste(im, (pad + k * (TW + pad), y))
        x = 3 * (TW + pad) + pad + 6
        g.text((x, y + 4), f"{i:02d}", font=fb, fill=(216, 203, 180))
        g.text((x + 44, y + 10), f"{t0:5.1f}s  +{shot_seconds(s):.1f}s", font=fs, fill=(163, 151, 127))
        kind = "BLENDER · " + s["scene"] if "scene" in s else "CAPTURE" if "clip" in s else "CARD"
        g.text((x, y + 38), kind, font=fs, fill=(201, 162, 39))
        words, line, ly = (s.get("note", "") or "").split(), "", y + 62
        for w in words:
            if g.textlength(line + " " + w, font=fs) > side - 30:
                g.text((x, ly), line.strip(), font=fs, fill=(216, 203, 180)); ly += 17; line = ""
            line += " " + w
        if line: g.text((x, ly), line.strip(), font=fs, fill=(216, 203, 180))
        for v in L.get("voice", []):
            if t0 <= v["at"] < t0 + shot_seconds(s):
                g.text((x, y + TH - 34), ("VO: " + v["text"])[:38], font=fs, fill=(150, 190, 255))
    out = a.work / "out" / f"{title}_board.jpg"; out.parent.mkdir(parents=True, exist_ok=True)
    board.save(out, quality=88); print(out)


if __name__ == "__main__":
    main()
