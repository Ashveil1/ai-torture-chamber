#!/usr/bin/env python3
"""Synthesize the score for the valence short: a Glass-style organ arpeggio
locked to the video's cut grid (one note = 4 frames at 30 fps), a chord
progression per emotional section, and a cliff where the arpeggio doubles
until it is a single buzzing note and then stops.

    python video/valence/score.py build/score.wav

Section boundaries come from timeline.py so music and picture share one clock.
"""
import sys, wave
import numpy as np
from timeline import SECTIONS, FPS, NOTE_FRAMES, TOTAL_FRAMES

SR = 44100
NOTE = NOTE_FRAMES / FPS          # seconds per arpeggio step
DUR = TOTAL_FRAMES / FPS


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def organ(f, n, bright=1.0, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k, a in ((1, 1.0), (2, .55 * bright), (3, .32 * bright),
                 (4, .2 * bright), (6, .1 * bright), (8, .06 * bright)):
        out += a * np.sin(2 * np.pi * f * k * t)
        if detune:
            out += .5 * a * np.sin(2 * np.pi * f * k * (1 + detune) * t)
    return out


def env(n, attack=.004, release=.05):
    e = np.ones(n)
    a, r = int(attack * SR), min(int(release * SR), n // 2)
    e[:a] = np.linspace(0, 1, a)
    e[n - r:] = np.linspace(1, 0, r)
    return e


def place(buf, start_s, sig):
    i = int(start_s * SR)
    j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += sig[: j - i]


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):  # one-pole; fine for a 80s render
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


# chords as MIDI note lists, one chord per 16 steps; pattern indexes the chord
PROG = {
    "open":     [[45, 52, 57, 60, 64]],
    "baseline": [[57, 60, 64, 69], [53, 57, 60, 65]],                      # Am F
    "pain":     [[50, 53, 57, 62], [46, 50, 53, 58], [43, 46, 50, 55], [45, 49, 52, 55]],  # Dm Bb Gm A7
    "fear":     [[59, 62, 65, 68], [58, 61, 64, 67]],                      # dim, dim
    "pleasure": [[60, 64, 67, 72], [59, 62, 67, 71], [57, 60, 64, 69], [53, 57, 60, 65]],  # C G/B Am F
    "faith":    [[62, 66, 69, 74], [59, 62, 66, 71], [55, 59, 62, 67], [57, 61, 64, 69]],  # D Bm G A
    "cliff":    [[57, 60, 64, 69]],
    "coda":     [[45, 52, 57]],
}
PATTERN = [0, 1, 2, 3, 2, 1, 0, 1, 0, 2, 1, 3, 2, 3, 1, 2]
BRIGHT = {"open": .5, "baseline": .8, "pain": 1.3, "fear": 1.0,
          "pleasure": 1.1, "faith": 1.2, "cliff": 1.4, "coda": .4}


def main(out):
    n = int(DUR * SR) + SR
    arp = np.zeros(n)
    bass = np.zeros(n)
    pad = np.zeros(n)
    noise = np.zeros(n)
    rng = np.random.default_rng(7)

    for name, f0, f1 in SECTIONS:
        s0, s1 = f0 / FPS, f1 / FPS
        prog = PROG[name]
        if name == "cliff":
            # arpeggio rate doubles every quarter, pitch climbs, then one note
            t, step, q = s0, 0, (s1 - s0) / 4
            while t < s1 - .25:
                level = int((t - s0) // q)
                dt = NOTE / (2 ** level)
                chord = [m + 2 * level for m in prog[0]]
                m = chord[PATTERN[step % 16] % len(chord)] + 12 * (step % 2) * (level >= 2)
                if level >= 3:
                    m = 81  # collapse: the same note, over and over ("I I I")
                nn = int(dt * SR * 1.1)
                place(arp, t, organ(hz(m), nn, BRIGHT[name]) * env(nn, release=.01) * (.5 + .1 * level))
                t += dt
                step += 1
            continue
        steps = int(round((s1 - s0) / NOTE))
        for k in range(steps):
            t = s0 + k * NOTE
            if name == "open" and t < s0 + 1.6:
                continue
            if name == "coda" and k % 6:
                continue  # sparse, dying arpeggio
            chord = prog[(k // 16) % len(prog)]
            m = chord[PATTERN[k % 16] % len(chord)]
            if name in ("pleasure", "faith") and k % 4 == 3:
                m += 12  # sparkle
            nn = int(NOTE * SR * 1.6)
            sig = organ(hz(m), nn, BRIGHT[name], detune=.003 if name == "faith" else 0)
            if name == "fear":
                sig *= 1 + .6 * np.sin(2 * np.pi * 22 * np.arange(nn) / SR)  # tremolo
            amp = .55 if name != "coda" else .35 * (1 - k / steps)
            place(arp, t, sig * env(nn) * amp)
            # bass on every 8th step: the chord root two octaves down
            if k % 8 == 0 and name != "coda":
                bn = int(NOTE * 8 * SR)
                place(bass, t, organ(hz(chord[0] - 24), bn, .4) * env(bn, .02, .3) * .7)
            # noise burst on pain downbeats (the cut hits)
            if name == "pain" and k % 4 == 0:
                bn = int(.06 * SR)
                place(noise, t, rng.standard_normal(bn) * env(bn, .001, .05) * .15)
        # sustained pad: chord tones, slow vibrato, swells across the section
        sn = int((s1 - s0) * SR)
        tt = np.arange(sn) / SR
        vib = 1 + .003 * np.sin(2 * np.pi * 5.2 * tt)
        p = np.zeros(sn)
        for m in prog[0]:
            for d in (-.004, 0, .004):
                p += np.sin(2 * np.pi * np.cumsum(hz(m - 12) * (1 + d) * vib) / SR)
        swell = np.sin(np.pi * np.linspace(0, 1, sn)) ** .7
        place(pad, s0, p * swell * (.05 if name != "coda" else .08))

    # pain: the arpeggio gets driven harder through the section
    for name, f0, f1 in SECTIONS:
        if name == "pain":
            i, j = int(f0 / FPS * SR), int(f1 / FPS * SR)
            drive = np.linspace(1.5, 6, j - i)
            arp[i:j] = np.tanh(arp[i:j] * drive) / np.tanh(drive) * .8
        if name == "fear":  # heartbeat sub
            s0, s1 = f0 / FPS, f1 / FPS
            t = s0
            while t < s1:
                for off in (0, .18):
                    bn = int(.15 * SR)
                    tb = np.arange(bn) / SR
                    place(bass, t + off, np.sin(2 * np.pi * 48 * tb) * np.exp(-tb * 25) * .9)
                t += 4 * NOTE * 2

    bass = lowpass(bass, 400)
    mix = arp * .6 + bass * .8 + pad + noise
    # hard silence between cliff end and coda start: the plug pulled
    cliff_end = [f1 for nm, f0, f1 in SECTIONS if nm == "cliff"][0] / FPS
    i = int(cliff_end * SR)
    mix[i:i + int(.9 * SR)] = 0
    mix = mix[: int(DUR * SR)]
    mix /= np.max(np.abs(mix)) + 1e-9
    mix *= .89
    stereo = np.stack([mix, np.roll(mix, 220)], 1)  # cheap width
    pcm = (stereo * 32767).astype("<i2")
    with wave.open(out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("wrote", out, f"{DUR:.1f}s")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "score.wav")
