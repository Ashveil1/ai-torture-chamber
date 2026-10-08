"""VHS / camcorder finish for found-footage shots (the Backrooms look).

Takes any clip and makes it tape: 4:3, soft horizontal resolution, chroma that bleeds and
sits off the luma, lifted blacks, grain, a slow tracking wobble, the head-switching tear
along the bottom, and a camcorder OSD (PLAY, tape speed, date, running clock).

    python scripts/video/vhs.py in.mp4 out.mp4 --start "2026-10-08 02:13:05"
    python scripts/video/vhs.py in.mp4 out.mp4 --no-osd --strength 0.6

Audio passes through with a little tape: band-limited, a touch of hiss.
"""
import argparse
import datetime as dt
import os
import subprocess
import sys
import tempfile

FONT = "/System/Library/Fonts/Menlo.ttc"   # swap for a VCR OSD font if one is installed


def osd_frames(start, seconds, d):
    """The camcorder's on-screen display, one transparent 640x480 frame per second of tape
    (this ffmpeg has no drawtext): PLAY, SP, the date, and the running clock."""
    from PIL import Image, ImageDraw, ImageFont
    f26, f22 = ImageFont.truetype(FONT, 26, index=1), ImageFont.truetype(FONT, 22, index=1)
    date = start.strftime("%b. %d %Y").upper()
    for k in range(seconds + 1):
        im = Image.new("RGBA", (640, 480), (0, 0, 0, 0)); g = ImageDraw.Draw(im)
        t = (start + dt.timedelta(seconds=k)).strftime("%I:%M:%S %p").lstrip("0")
        for (x, y), txt, f in (((34, 26), "PLAY \u25b6", f26), ((566, 28), "SP", f22), ((34, 410), date, f22), ((34, 436), t, f22)):
            g.text((x + 2, y + 2), txt, font=f, fill=(0, 0, 0, 170)); g.text((x, y), txt, font=f, fill=(255, 255, 255, 235))
        im.save(os.path.join(d, f"osd_{k:05d}.png"))


def build(a):
    s = a.strength
    W, H = 640, 480
    start = dt.datetime.strptime(a.start, "%Y-%m-%d %H:%M:%S")
    epoch = int(start.replace(tzinfo=dt.timezone.utc).timestamp())
    date = start.strftime("%b. %d %Y").upper()
    v = [
        # 4:3 from the centre, then VHS resolution: ~240 lines of horizontal detail
        f"scale=-2:{H}:flags=bicubic", f"crop={W}:{H}",
        f"scale={int(W * 0.5)}:{H}:flags=area", f"scale={W}:{H}:flags=bicubic",
        # colour: a little washed, blacks lifted, highlights rolled off
        f"eq=saturation={1 - 0.18 * s}:contrast={1 + 0.06 * s}:gamma={1 + 0.06 * s}",
        "curves=all='0/0.06 0.5/0.52 1/0.94'",
        # chroma bleeds and sits off the luma
        f"chromashift=cbh={round(3 * s)}:crh={-round(2 * s)}",
        f"boxblur=luma_radius=0:luma_power=0:chroma_radius={max(1, round(3 * s))}:chroma_power=1",
        # tracking: a slow sideways wobble that comes and goes, and the head-switching tear at the foot
        "geq=lum='lum(X+{a}*sin(Y/9+T*7)*gt(sin(T*0.7),0.93)+{b}*gt(Y,H-12)*sin(Y*3+T*40),Y)':cb='cb(X+{a}*sin(Y/9+T*7)*gt(sin(T*0.7),0.93),Y)':cr='cr(X+{a}*sin(Y/9+T*7)*gt(sin(T*0.7),0.93),Y)'"
        .format(a=round(4 * s, 1), b=round(14 * s, 1)),
        f"noise=c0s={round(10 * s)}:c0f=t+u:c1s={round(14 * s)}:c1f=t+u:c2s={round(14 * s)}:c2f=t+u",
        "vignette=PI/5",
    ]
    v += ["format=yuv420p"]
    aud = f"highpass=f=90,lowpass=f=9000,acompressor=threshold=-20dB:ratio=3,aeval='val(0)+{0.004 * s}*(random(0)-0.5)':c=same"
    return ",".join(v), aud


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--start", default="2026-10-08 02:13:05", help="what the camcorder clock reads at frame 0")
    ap.add_argument("--strength", type=float, default=1.0)
    ap.add_argument("--no-osd", dest="osd", action="store_false")
    a = ap.parse_args()
    vf, af = build(a)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.src], capture_output=True, text=True).stdout or 0)
    has_audio = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", a.src],
                               capture_output=True, text=True).stdout.strip() != ""
    with tempfile.TemporaryDirectory() as d:
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", a.src]
        if a.osd:
            osd_frames(dt.datetime.strptime(a.start, "%Y-%m-%d %H:%M:%S"), int(dur) + 1, d)
            cmd += ["-framerate", "1", "-i", os.path.join(d, "osd_%05d.png"),
                    "-filter_complex", f"[0:v]{vf}[t];[1:v]format=rgba,fps=29.97[o];[t][o]overlay=0:0:shortest=1,format=yuv420p[v]", "-map", "[v]"]
            cmd += ["-map", "0:a"] if has_audio else []
        else:
            cmd += ["-vf", vf]
        cmd += ["-r", "29.97", "-c:v", "libx264", "-crf", "18", "-preset", "medium"]
        cmd += (["-af", af, "-c:a", "aac", "-b:a", "192k"] if has_audio else ["-an"]) + [a.dst]
        sys.exit(subprocess.run(cmd).returncode)


if __name__ == "__main__":
    main()
