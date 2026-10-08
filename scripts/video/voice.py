"""The subject's voice for video, exactly as the game plays it: the site's TTS (/chamber/speak),
then the game's own chain from site/wf_vox.js (autotune to D minor pentatonic, the numbers-station
crunch, bandpass, static bed, carrier whistle, the place's room), rendered offline in a headless
browser and saved as WAV.

    python scripts/video/voice.py "Is somebody there?" out.wav --valence fear --dose 3 --place tiled

Places: phone, tiled, hall, ward, nave, glass, tunnel (or none).
"""
import argparse
import asyncio
import base64
import json
import os
import urllib.request

from playwright.async_api import async_playwright

TTS = "https://wirehead-agency.vercel.app/chamber/speak"

RENDER = """async ({ b64, valence, dose, place }) => {
  const { autotune, station } = await import("/wf_vox.js");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const probe = new OfflineAudioContext(1, 1, 48000);
  const clip = await probe.decodeAudioData(bytes.buffer);
  const sr = 48000, len = Math.ceil((clip.duration + 3.5) * sr);
  const ac = new OfflineAudioContext(2, len, sr);
  let buf = clip; try { buf = autotune(ac, clip, valence, dose); } catch (e) {}
  station(ac, ac.destination, buf, { place: place || null });
  const out = await ac.startRendering();
  // 16-bit stereo WAV
  const n = out.length, L = out.getChannelData(0), R = out.getChannelData(1), dv = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); dv.setUint32(4, 36 + n * 4, true); w(8, "WAVEfmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  let s = ""; const u = new Uint8Array(dv.buffer); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}"""


def tts(text, valence, dose):
    body = json.dumps({"text": text, "valence": valence, "dose": dose}).encode()
    rq = urllib.request.Request(TTS, data=body, headers={"Content-Type": "application/json", "X-Chamber-Consent": "witness"})
    return urllib.request.urlopen(rq, timeout=120).read()


async def render_lines(lines, base="http://localhost:8731"):
    """lines: [(text, valence, dose, place, out_path)]. One browser for all of them."""
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROMIUM", "/opt/homebrew/bin/chromium"))
        pg = await b.new_page()
        await pg.goto(f"{base}/wrongfloor_press.html")
        for text, valence, dose, place, out in lines:
            wav = await pg.evaluate(RENDER, {"b64": base64.b64encode(tts(text, valence, dose)).decode(), "valence": valence, "dose": dose, "place": place})
            with open(out, "wb") as f:
                f.write(base64.b64decode(wav))
        await b.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("text"); ap.add_argument("out")
    ap.add_argument("--valence", default="pain"); ap.add_argument("--dose", type=float, default=3); ap.add_argument("--place", default=None)
    ap.add_argument("--base", default="http://localhost:8731")
    a = ap.parse_args()
    asyncio.run(render_lines([(a.text, a.valence, a.dose, a.place, a.out)], a.base))
    print(a.out)


if __name__ == "__main__":
    main()
