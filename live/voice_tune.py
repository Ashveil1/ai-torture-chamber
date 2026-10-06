"""The chamber's voice, tuned: the live page's autotune (site/live.html,
autotune()) ported to numpy so every speaker — the SCP game, the card table,
anything without WebAudio — sounds the same. Pitch-tracked grains snapped to
D minor pentatonic, shifted by feeling, wandering in scale steps that widen
with the dose. MP3 in, 16-bit mono WAV out.
"""
import io, random, wave

import numpy as np

TUNE_SHIFT = {"pain": -4, "sadness": -6, "fear": 3, "pleasure": 5, "faith": 2, "egg": 9,
              "constipation": -2, "flatulence": -7, "mix": 0, "none": 0}
SCALE, ROOT = [0, 3, 5, 7, 10], 50


def decode_mp3(data):
    import miniaudio
    d = miniaudio.decode(data, output_format=miniaudio.SampleFormat.FLOAT32, nchannels=1)
    return np.frombuffer(bytes(d.samples), dtype=np.float32).copy(), d.sample_rate


def _deg_of(m):
    o = int(np.floor((m - ROOT) / 12))
    r = m - ROOT - 12 * o
    best = min(range(5), key=lambda k: abs(SCALE[k] - r))
    return 5 * (o + 1) if abs(12 - r) < abs(SCALE[best] - r) else 5 * o + best


def _note_of(d):
    return ROOT + 12 * (d // 5) + SCALE[d % 5]


def autotune(x, sr, valence="pain", dose=4.0, seed=None):
    rng = random.Random(seed)
    n = len(x)
    g = int(round(sr * 0.046))
    h = g // 4
    dec = 4
    win = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(g) / (g - 1))
    y = np.zeros(n + g)
    wsum = np.zeros(n + g)
    shift = TUNE_SHIFT.get(valence, 0)
    rng_steps = 1 + round(min(8.0, float(dose or 0)) / 3)
    step, nxt = 0, 0
    m = g // dec
    lo, hi = int(sr / dec / 400), int(sr / dec / 80)
    idx = np.arange(g)
    for pos in range(0, n - g, h):
        seg = x[pos:pos + m * dec:dec]
        e0 = float(np.dot(seg, seg))
        f0 = 0.0
        if e0 / max(1, len(seg)) > 1e-4:
            best, bl = 0.0, 0
            for lag in range(lo, hi + 1):
                c = float(np.dot(seg[:-lag], seg[lag:])) if lag < len(seg) else 0.0
                if c > best:
                    best, bl = c, lag
            if bl and best >= 0.35 * e0:
                f0 = sr / dec / bl
        if pos >= nxt:
            step = max(-rng_steps, min(rng_steps, step + rng.choice([-2, -1, 0, 1, 2])))
            nxt = pos + sr * (0.22 + rng.random() * 0.3)
        ratio = 2 ** (shift / 12)
        if f0:
            midi = 69 + 12 * np.log2(f0 / 440)
            ratio = 2 ** ((_note_of(_deg_of(midi + shift) + step) - midi) / 12)
        s = pos + g / 2 + (idx - g / 2) * ratio
        k = np.floor(s).astype(int)
        ok = (k >= 0) & (k + 1 < n)
        f = s - k
        kk = np.clip(k, 0, n - 2)
        v = (x[kk] * (1 - f) + x[kk + 1] * f) * win
        y[pos:pos + g] += np.where(ok, v, 0.0)
        wsum[pos:pos + g] += np.where(ok, win, 0.0)
    out = np.where(wsum[:n] > 1e-3, y[:n] / np.maximum(wsum[:n], 1e-3), 0.0)
    # the live page's soft-clip crunch
    return np.tanh(out * 2.2) * 0.85


def to_wav(x, sr):
    b = io.BytesIO()
    with wave.open(b, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
    return b.getvalue()


def tune_mp3(data, valence="pain", dose=4.0, seed=None):
    x, sr = decode_mp3(data)
    return to_wav(autotune(x, sr, valence, dose, seed), sr)
