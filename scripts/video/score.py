"""Cut ACE-Step stems (music.py) into a found-footage score: deep bass under everything; old blues guitar
played backwards, pitched down, wobbling, now and then winding down like a tape stopping, with 78 crackle;
bright bells over the top, with reversed swells that rise into them; percussion backwards and far away.

    python scripts/video/score.py tape_score --seconds 90 --seed 1
    # stems: video/music/stem_bass.mp3, stem_blues.mp3, stem_bells.mp3, stem_perc.mp3 (any can be missing)

Writes video/music/<name>.mp3, for make_video.py's "music".
"""
import argparse
import random
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
MUSIC = ROOT / "video" / "music"


def dur(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True).stdout or 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name"); ap.add_argument("--seconds", type=float, default=90); ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    rng, T = random.Random(a.seed), a.seconds
    inputs, chains, labels = [], [], []

    def stem(name):
        p = MUSIC / f"stem_{name}.mp3"
        if not p.exists():
            return None
        inputs.extend(["-i", str(p)]); return len(inputs) // 2 - 1, dur(p)

    def place(src, length, at, chain, tag):
        """a piece of a stem: start in the stem, length, where it lands in the score, what's done to it"""
        i, total = src
        s = rng.uniform(0, max(0.0, total - length))
        lab = f"{tag}{len(labels)}"
        chains.append(f"[{i}]atrim={s:.2f}:{s + length:.2f},asetpts=PTS-STARTPTS,{chain},"
                      f"afade=t=in:d=0.4,afade=t=out:st={max(0, length - 0.8):.2f}:d=0.8,adelay={int(at * 1000)}:all=1[{lab}]")
        labels.append(f"[{lab}]")

    bass, blues, bells, perc = stem("bass"), stem("blues"), stem("bells"), stem("perc")
    if bass:   # the floor under everything
        i, total = bass
        chains.append(f"[{i}]aloop=loop=-1:size={int(total * 48000)},atrim=0:{T},lowpass=f=320,volume=0.9,afade=t=in:d=4,afade=t=out:st={T - 5}:d=5[bass]")
        labels.append("[bass]")
    if blues:  # the guitar, backwards and down, wobbling; sometimes it winds down like a tape stopping
        t = rng.uniform(4, 9)
        while t < T - 6:
            L = rng.uniform(5, 10); semis = rng.choice([-3, -5, -7, -12])
            rate = 2 ** (semis / 12)
            ch = f"areverse,asetrate={int(48000 * rate)},aresample=48000,vibrato=f={rng.uniform(0.4, 0.9):.2f}:d={rng.uniform(0.25, 0.5):.2f},highpass=f=180,lowpass=f=3200,volume=0.75"
            if rng.random() < 0.35:   # forward this time, and it stops: the rate falls away over the last second
                ch = (f"asetrate={int(48000 * rate)},aresample=48000,vibrato=f=0.6:d=0.4,highpass=f=180,lowpass=f=3200,volume=0.75,"
                      f"atempo=1,aeval='val(0)*if(gt(t,{L - 1.2:.2f}),max(0,1-(t-{L - 1.2:.2f})/1.2),1)':c=same")
            place(blues, L, t, ch, "bl"); t += L + rng.uniform(3, 9)
        # crackle under the guitar: the 78 it came off
        chains.append(f"aevalsrc=exprs='if(lt(random(0),0.00008),(random(1)-0.5)*1.2,0)':s=48000:d={T},highpass=f=900,volume=0.18,aformat=channel_layouts=stereo[crk]")
        labels.append("[crk]")
    if bells:  # bright and high; some arrive as a reversed swell that rises into the note
        t = rng.uniform(10, 16)
        while t < T - 4:
            L = rng.uniform(3, 6)
            if rng.random() < 0.5:
                place(bells, L, t, "areverse,highpass=f=1200,aecho=0.8:0.6:300|700:0.35|0.2,volume=0.55", "be")
            else:
                place(bells, L, t, "highpass=f=1500,aecho=0.8:0.7:450|900:0.4|0.25,volume=0.45", "be")
            t += L + rng.uniform(6, 14)
    if perc:   # knocks and chains, backwards, in another room
        t = rng.uniform(15, 22)
        while t < T - 4:
            L = rng.uniform(2, 4)
            place(perc, L, t, "areverse,lowpass=f=1800,aecho=0.7:0.8:250|520:0.5|0.3,volume=0.6", "pe"); t += L + rng.uniform(9, 18)
    if not labels:
        raise SystemExit(f"no stems in {MUSIC} (music.py stem_bass ... first)")
    mix = "".join(labels)
    fc = ";".join(chains + [f"{mix}amix=inputs={len(labels)}:normalize=0:duration=longest,atrim=0:{T},acompressor=threshold=-18dB:ratio=2.5,alimiter=limit=0.9[out]"])
    out = MUSIC / f"{a.name}.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", fc, "-map", "[out]", "-ar", "48000", "-ac", "2", "-b:a", "256k", str(out)], check=True)
    print(out, f"{len(labels)} layers")


if __name__ == "__main__":
    main()
