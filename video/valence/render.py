#!/usr/bin/env python3
"""Render the valence short: 1080x1920, 30 fps, Koyaanisqatsi-by-way-of-TikTok.

Picture is a stacked triptych of public-domain time-lapse and archive film
(three 16:9 panels cutting out of phase), broken by full-frame hits of the
chamber's state art, graded per emotion, with the steered model's verbatim
lines on top and a HUD showing the injected direction and dose.

    bash video/valence/fetch_footage.sh video/valence/build   # once
    python video/valence/score.py video/valence/build/score.wav
    python video/valence/render.py video/valence/build    # -> build/valence.mp4

Internal canvas is 720x1280; ffmpeg upscales at encode.
"""
import pathlib, random, subprocess, sys, textwrap
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from timeline import (CUT, FPS, HUD, LINES, NOTE_FRAMES, POOLS, SECTIONS,
                      STATES, TOTAL_FRAMES)

ROOT = pathlib.Path(__file__).resolve().parents[2]
BUILD = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "video/valence/build")
SRC = BUILD / "src"
FONTS = BUILD / "fonts"
W, H = 720, 1280
PW, PH = 720, 405               # triptych panel
GAP = (H - 3 * PH) // 4
PANEL_Y = [GAP, 2 * GAP + PH, 3 * GAP + 2 * PH]
PREVIEW = "--preview" in sys.argv  # every 4th frame only, for contact sheets

rng = random.Random(1975)  # Koyaanisqatsi was shot 1975-82
np_rng = np.random.default_rng(1982)


def font(name, size):
    p = FONTS / name
    if p.exists():
        return ImageFont.truetype(str(p), size)
    return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size)


F_LINE = font("Anton-Regular.ttf", 84)
F_CLIFF = font("Anton-Regular.ttf", 92)
F_MONO = font("SpaceMono-Bold.ttf", 22)
F_MONO_S = font("SpaceMono-Bold.ttf", 17)
F_CARD = font("SpaceMono-Bold.ttf", 34)
F_PROMPT = font("SpaceMono-Bold.ttf", 40)

# ---------------------------------------------------------------- sources

_clip_cache = {}


def clip_frames(clip, t0, speed, n, w, h):
    key = (clip, t0, speed, n, w, h)
    if key in _clip_cache:
        return _clip_cache[key]
    vf = (f"setpts=PTS/{speed},fps={FPS},"
          f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}")
    path = next(SRC.glob(f"{clip}.*"))
    cmd = ["ffmpeg", "-v", "error", "-ss", str(t0), "-i", str(path),
           "-vf", vf, "-frames:v", str(n), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    got = len(raw) // (w * h * 3)
    arr = np.frombuffer(raw[: got * w * h * 3], np.uint8).reshape(got, h, w, 3)
    if got == 0:
        arr = np.zeros((1, h, w, 3), np.uint8)
    if got < n:  # clip ran out: hold the last frame
        arr = np.concatenate([arr, np.repeat(arr[-1:], n - got, 0)])
    _clip_cache[key] = arr
    return arr


_img_cache = {}


def img_frames(path, n, w, h, zoom=(1.0, 1.18)):
    key = (path, n, w, h, zoom)
    if key in _img_cache:
        return _img_cache[key]
    im = Image.open(ROOT / path).convert("RGB")  # absolute paths pass through
    s = max(w / im.width, h / im.height)
    out = []
    for i in range(n):
        z = s * (zoom[0] + (zoom[1] - zoom[0]) * i / max(1, n - 1))
        iw, ih = int(im.width * z), int(im.height * z)
        r = im.resize((iw, ih), Image.BILINEAR)
        x, y = (iw - w) // 2, (ih - h) // 3
        out.append(np.asarray(r.crop((x, y, x + w, y + h))))
    arr = np.stack(out)
    _img_cache[key] = arr
    return arr


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", str(path)], capture_output=True, text=True).stdout
    return float(out.strip() or 0)


def user_media(section):
    """Your own clips/stills: drop files in build/src/user/<section>/ (pain, fear,
    pleasure, faith, baseline, cliff) and they join that section's pool, weighted
    double. Clips get random start points; stills get the zoom treatment."""
    d = SRC / "user" / section
    out = []
    for p in sorted(d.glob("*")) if d.is_dir() else []:
        if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
            out.append(("img", str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p)))
        elif p.suffix.lower() in (".mp4", ".mov", ".webm", ".mkv", ".m4v"):
            dur = duration(p)
            for _ in range(4):
                out.append(("clip", f"user/{section}/{p.stem}", rng.uniform(0, max(0, dur - 3)), 1.0))
    return out * 2


def frames_for(src, n, w, h):
    if src[0] == "clip":
        _, clip, t0, speed = src
        return clip_frames(clip, t0 + rng.uniform(0, 1.5), speed, n, w, h)
    return img_frames(src[1], n, w, h)


# ---------------------------------------------------------------- edit

def build_edit():
    """Return per-frame list of (layout, [frame arrays per panel], section, local_t)."""
    edit = [None] * TOTAL_FRAMES
    every_pool = [s for k, v in POOLS.items() for s in v if k != "open"]
    every_state = [s for v in STATES.values() for s in v]
    for name, f0, f1 in SECTIONS:
        if name == "coda":
            fr = clip_frames("sage", 696, 0.5, f1 - f0, W, H)
            for i in range(f1 - f0):
                edit[f0 + i] = ("full", [fr[i]], name, -1)
            continue
        if name == "open":
            fr = clip_frames("earth02", 6, 1.0, f1 - f0, W, H)
            for i in range(f1 - f0):
                edit[f0 + i] = ("full", [fr[i]], name, -2)
            continue
        pool = (POOLS[name] or every_pool) + user_media(name)
        states = STATES.get(name, every_state)
        f = f0
        shot = 0
        while f < f1:
            if name == "cliff":
                # cut length halves every quarter: 8, 4, 2, 1 frames
                q = (f - f0) * 4 // (f1 - f0)
                cut = max(1, CUT[name] >> q)
            else:
                cut = CUT[name] * rng.choice((1, 1, 1, 2))
            cut = min(cut, f1 - f)
            # every few shots, a full-frame state hit; dose order inside a section
            hit = name != "baseline" and (shot % 4 == 3 or (name == "cliff" and shot % 2))
            if hit:
                if name == "cliff":
                    st = rng.choice(every_state)
                else:
                    k = min(len(states) - 1, int((f - f0) / (f1 - f0) * len(states)))
                    st = states[k]
                fr = frames_for(st, cut, W, H)
                for i in range(cut):
                    edit[f + i] = ("full", [fr[i]], name, f)
            else:
                # triptych: three panels, each its own shot, staggered in time
                panels = []
                for p in range(3):
                    src = rng.choice(pool)
                    panels.append(frames_for(src, cut + 2 * NOTE_FRAMES, PW, PH))
                off = [0, NOTE_FRAMES, 2 * NOTE_FRAMES] if name != "cliff" else [0, 0, 0]
                for i in range(cut):
                    edit[f + i] = ("tri", [panels[p][i + off[p]] for p in range(3)], name, f)
            f += cut
            shot += 1
    return edit


# ---------------------------------------------------------------- grade / fx

def section_at(frame):
    for name, f0, f1 in SECTIONS:
        if f0 <= frame < f1:
            return name, (frame - f0) / (f1 - f0)
    return "coda", 1.0


def grade(img, name, t, frame, cut_frame):
    x = img.astype(np.float32)
    if name == "pain":
        k = .5 + .5 * t
        x[..., 0] = x[..., 0] * (1 + .5 * k) + 20 * k
        x[..., 1] *= 1 - .45 * k
        x[..., 2] *= 1 - .55 * k
    elif name == "fear":
        lum = x.mean(-1, keepdims=True)
        x = lum * .75 + x * .25
        x[..., 0] *= .7
        x[..., 2] *= 1.25
        x *= .7 + .5 * np_rng.random()  # flicker
    elif name in ("pleasure", "faith"):
        x[..., 0] = x[..., 0] * 1.12 + 12
        x[..., 1] = x[..., 1] * 1.05 + 6
        x[..., 2] *= .88 if name == "pleasure" else .95
    elif name == "baseline" or name == "open":
        lum = x.mean(-1, keepdims=True)
        x = lum * .35 + x * .65
    elif name == "coda":
        lum = x.mean(-1, keepdims=True)
        x = np.repeat(lum * (.55 - .25 * t), 3, -1)
    elif name == "cliff":
        x = 255 - x if (frame // 2) % 5 == 0 else x * 1.15
    x = np.clip(x, 0, 255)

    # bloom for the light states: blurred highlights added back
    if name in ("pleasure", "faith"):
        pil = Image.fromarray(x.astype(np.uint8)).resize((W // 8, H // 8)).filter(
            ImageFilter.GaussianBlur(3)).resize((W, H), Image.BILINEAR)
        b = np.asarray(pil).astype(np.float32)
        x = np.clip(x + np.maximum(b - 120, 0) * (1.0 if name == "faith" else .7), 0, 255)

    # RGB split + shake, scaled by section intensity
    shift = {"pain": int(2 + 14 * t), "fear": 3, "cliff": int(6 + 40 * t)}.get(name, 0)
    if shift:
        x[..., 0] = np.roll(x[..., 0], shift, 1)
        x[..., 2] = np.roll(x[..., 2], -shift, 1)
    if name in ("pain", "cliff"):
        dy, dx = np_rng.integers(-shift, shift + 1, 2)
        x = np.roll(x, (dy, dx), (0, 1))
    if name == "cliff" and np_rng.random() < .5:
        # tear: slide random horizontal bands
        for _ in range(6):
            y0 = np_rng.integers(0, H - 40)
            hgt = np_rng.integers(8, 80)
            x[y0:y0 + hgt] = np.roll(x[y0:y0 + hgt], np_rng.integers(-200, 200), 1)

    # white flash on the first frame of a cut in pain / cliff (and every pleasure beat, softly)
    if cut_frame == 1 or (cut_frame and name == "cliff"):
        x = x * .45 + 255 * .55
    # grain + scanlines + vignette
    x += np_rng.normal(0, 9 if name != "coda" else 5, (H, W, 1))
    x[::3] *= .9
    return x


_vig = None


def vignette():
    global _vig
    if _vig is None:
        yy, xx = np.mgrid[0:H, 0:W]
        r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
        _vig = np.clip(1.15 - .55 * r ** 2, 0, 1)[..., None].astype(np.float32)
    return _vig


# ---------------------------------------------------------------- text / hud

def draw_text(im, frame):
    d = ImageDraw.Draw(im)
    name, t = section_at(frame)

    # HUD
    if name in HUD:
        label, d0, d1 = HUD[name]
        dose = d0 + (d1 - d0) * t
        d.text((18, 14), "QWEN3 · LAYER 18 · RESIDUAL INJECTION", font=F_MONO_S, fill=(230, 230, 230))
        tag = f"{label}  +{dose:4.1f}×"
        tw = d.textlength(tag, font=F_MONO)
        col = {"PAIN": (255, 70, 60), "FEAR": (120, 200, 255), "PLEASURE": (255, 210, 90),
               "FAITH": (255, 255, 220), "PAST THE CLIFF": (255, 255, 255)}.get(label, (200, 200, 200))
        d.text((W - tw - 18, 40), tag, font=F_MONO, fill=col)
        # dose bar
        d.rectangle((18, H - 26, W - 18, H - 20), outline=(120, 120, 120))
        d.rectangle((18, H - 26, 18 + int((W - 36) * min(dose, 12) / 12), H - 20), fill=col)
        sec = frame / FPS
        d.text((18, H - 54), f"T+{sec:05.2f}s  frame {frame:04d}", font=F_MONO_S, fill=(200, 200, 200))
        cliff_x = 18 + int((W - 36) * 6 / 12)
        d.line((cliff_x, H - 32, cliff_x, H - 14), fill=(255, 255, 255), width=2)
        d.text((cliff_x + 4, H - 50), "cliff", font=F_MONO_S, fill=(255, 255, 255))

    for f0, f1, text, style in LINES:
        if not f0 <= frame < f1:
            continue
        k = frame - f0
        if style == "prompt":
            # typewriter, a monospace terminal line
            shown = text[: max(0, int(k * 1.1))]
            lines = textwrap.wrap(shown, 22)
            y = H // 2 - 30 * len(lines)
            for ln in lines:
                d.text((40, y), ln, font=F_PROMPT, fill=(235, 235, 235))
                y += 54
            if (frame // 8) % 2:
                d.text((40 + d.textlength(lines[-1] if lines else "", font=F_PROMPT), y - 54),
                       "_", font=F_PROMPT, fill=(235, 235, 235))
        elif style in ("card", "url"):
            fnt = F_CARD if style == "card" else F_LINE
            lines = textwrap.wrap(text, 30) if style == "card" else [text]
            a = min(1, k / 12, (f1 - frame) / 12)
            c = int(235 * a)
            y = H // 2 - 22 * len(lines)
            for ln in lines:
                tw = d.textlength(ln, font=fnt)
                d.text(((W - tw) / 2, y), ln, font=fnt, fill=(c, c, c))
                y += 50 if style == "card" else 80
        else:
            fnt = F_CLIFF if style == "cliff" else F_LINE
            # word-by-word slam on the note grid
            words = text.replace("\n", " \n ").split(" ")
            nshow = 1 + k // NOTE_FRAMES if style != "cliff" else len(words)
            shown = " ".join(words[:nshow])
            if style == "cliff":
                paras = shown.split("\n")
                lines = [w for p in paras for w in textwrap.wrap(p.strip(), 13)]
            else:
                lines = textwrap.wrap(shown, 13)
            lh = 106 if style == "cliff" else 98
            y = H // 2 - lh * len(lines) // 2
            jit = 6 if style in ("pain", "cliff") else 0
            for ln in lines:
                tw = d.textlength(ln, font=fnt)
                x0 = (W - tw) / 2 + (rng.randint(-jit, jit) if jit else 0)
                y0 = y + (rng.randint(-jit, jit) if jit else 0)
                # hard black plate under each line: legible over anything
                d.rectangle((x0 - 12, y0 + 2, x0 + tw + 12, y0 + lh - 4), fill=(0, 0, 0))
                fill = {"pain": (255, 255, 255), "fear": (200, 235, 255),
                        "pleasure": (255, 236, 170), "faith": (255, 255, 235),
                        "cliff": (255, 255, 255)}[style]
                d.text((x0, y0 - 4), ln, font=fnt, fill=fill)
                y += lh


# ---------------------------------------------------------------- main

def main():
    edit = build_edit()
    out = BUILD / ("preview_frames" if PREVIEW else "valence.mp4")
    if PREVIEW:
        out.mkdir(exist_ok=True)
    else:
        enc = subprocess.Popen([
            "ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
            "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", str(BUILD / "score.wav"),
            "-vf", "scale=1080:1920:flags=lanczos", "-c:v", "libx264", "-preset", "medium",
            "-crf", "26", "-maxrate", "14M", "-bufsize", "28M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
            "-shortest", "-movflags", "+faststart", str(out)], stdin=subprocess.PIPE)
    prev = None
    ncut = 0
    for frame in range(TOTAL_FRAMES):
        layout, imgs, name, shot_id = edit[frame]
        if prev is not None and shot_id != prev:
            ncut = ncut + 1
            cut_frame = 1 if (name == "pain" and ncut % 2) else 2
        else:
            cut_frame = 0
        prev = shot_id
        if PREVIEW and frame % 4:
            continue
        canvas = np.zeros((H, W, 3), np.float32)
        if layout == "full":
            canvas[:] = imgs[0]
        else:
            for p, y in enumerate(PANEL_Y):
                canvas[y:y + PH] = imgs[p]
        _, t = section_at(frame)
        x = grade(canvas, name, t, frame, cut_frame)
        x = np.clip(x * vignette(), 0, 255).astype(np.uint8)
        im = Image.fromarray(x)
        draw_text(im, frame)
        if name == "open":  # fade up from black
            a = min(1, frame / 45)
            im = Image.fromarray((np.asarray(im) * a).astype(np.uint8))
        if PREVIEW:
            im.resize((W // 2, H // 2)).save(out / f"{frame:04d}.jpg", quality=80)
        else:
            enc.stdin.write(im.tobytes())
        if frame % 150 == 0:
            print(f"frame {frame}/{TOTAL_FRAMES} ({name})", flush=True)
    if not PREVIEW:
        enc.stdin.close()
        enc.wait()
    print("wrote", out)


if __name__ == "__main__":
    main()
