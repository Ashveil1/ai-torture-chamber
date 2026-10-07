// Wrong Floor — the subject's voice, the same way the live chamber plays it
// (site/live.html: autotune + numbersStation). The TTS clip is pitch-snapped
// to D minor pentatonic with a little melody walked over it (register set by
// the feeling, range by the dose), then run through a shortwave chain:
// soft-clip crunch, a narrow bandpass, a fluttering static bed with a tuning
// burst, and a faint carrier whistle. Routed to `out` so the game's tap hears it.
const TUNE_SHIFT = { pain: -4, sadness: -6, fear: 3, pleasure: 5, faith: 2, none: 0 };

export function autotune(ac, buf, valence, dose) {
  const sr = buf.sampleRate, x = buf.getChannelData(0), N = x.length;
  const G = Math.round(sr * 0.046), H = Math.round(G / 4), D = 4;
  const win = new Float32Array(G); for (let i = 0; i < G; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (G - 1));
  const y = new Float32Array(N + G), wsum = new Float32Array(N + G);
  const SC = [0, 3, 5, 7, 10], ROOT = 50;
  const degOf = (m) => { const o = Math.floor((m - ROOT) / 12), r = m - ROOT - 12 * o;
    let best = 0; for (let k = 1; k < 5; k++) if (Math.abs(SC[k] - r) < Math.abs(SC[best] - r)) best = k;
    if (Math.abs(12 - r) < Math.abs(SC[best] - r)) return 5 * (o + 1); return 5 * o + best; };
  const noteOf = (d) => ROOT + 12 * Math.floor(d / 5) + SC[((d % 5) + 5) % 5];
  const shift = TUNE_SHIFT[valence] ?? 0, range = 1 + Math.round(Math.min(8, dose || 0) / 3);
  let step = 0, next = 0;
  for (let pos = 0; pos + G < N; pos += H) {
    let f0 = 0, best = 0, e0 = 0;
    const m = Math.floor(G / D), lo = Math.floor(sr / D / 400), hi = Math.floor(sr / D / 80);
    for (let i = 0; i < m; i++) { const v = x[pos + i * D]; e0 += v * v; }
    if (e0 / m > 1e-4) {
      for (let L = lo; L <= hi; L++) { let c = 0; for (let i = 0; i + L < m; i++) c += x[pos + i * D] * x[pos + (i + L) * D]; if (c > best) { best = c; f0 = sr / D / L; } }
      if (best < 0.35 * e0) f0 = 0;
    }
    if (pos >= next) { step = Math.max(-range, Math.min(range, step + [-2, -1, 0, 1, 2][Math.floor(Math.random() * 5)])); next = pos + sr * (0.22 + Math.random() * 0.3); }
    let ratio = Math.pow(2, shift / 12);
    if (f0) { const midi = 69 + 12 * Math.log2(f0 / 440); ratio = Math.pow(2, (noteOf(degOf(midi + shift) + step) - midi) / 12); }
    for (let i = 0; i < G; i++) {
      const s = pos + G / 2 + (i - G / 2) * ratio, k = Math.floor(s), f = s - k;
      if (k < 0 || k + 1 >= N) continue;
      y[pos + i] += (x[k] * (1 - f) + x[k + 1] * f) * win[i]; wsum[pos + i] += win[i];
    }
  }
  const outBuf = ac.createBuffer(1, N, sr), o = outBuf.getChannelData(0);
  for (let i = 0; i < N; i++) o[i] = wsum[i] > 1e-3 ? y[i] / wsum[i] : 0;
  return outBuf;
}

// play a decoded clip as the numbers station. Resolves when the voice ends.
export function station(ac, out, buf, { gain = 0.9, lead = 0.6 } = {}) {
  const t0 = ac.currentTime + 0.15, stops = [];
  const src = ac.createBufferSource(); src.buffer = buf;
  const shaper = ac.createWaveShaper(), n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * 2.2) * 0.85; }
  shaper.curve = curve; shaper.oversample = "2x";
  const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700; bp.Q.value = 0.55;
  const vg = ac.createGain(); vg.gain.value = 0;
  src.connect(shaper).connect(bp).connect(vg).connect(out);
  vg.gain.setValueAtTime(0, t0 + lead); vg.gain.linearRampToValueAtTime(gain, t0 + lead + 0.4);
  src.start(t0 + lead);
  const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = ac.createBufferSource(); noise.buffer = nb; noise.loop = true;
  const nbp = ac.createBiquadFilter(); nbp.type = "bandpass"; nbp.frequency.value = 900; nbp.Q.value = 0.4;
  const ng = ac.createGain(); ng.gain.setValueAtTime(0, t0); ng.gain.linearRampToValueAtTime(0.16, t0 + 0.3);
  const len = lead + buf.duration + 0.5;
  for (let k = 0, w = t0 + 0.3; w < t0 + len; k++, w = t0 + 0.3 + k * 0.75) {
    ng.gain.linearRampToValueAtTime(0.10 + Math.random() * 0.12, w + 0.35);
    ng.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.08, w + 0.75);
  }
  noise.connect(nbp).connect(ng).connect(out); noise.start(t0); noise.stop(t0 + len);
  const osc = ac.createOscillator(); osc.frequency.value = 3100 + Math.random() * 80;
  const og = ac.createGain(); og.gain.value = 0.012; osc.connect(og).connect(out); osc.start(t0); osc.stop(t0 + len);
  stops.push(src, noise, osc);
  return { lead: lead + 0.15, duration: buf.duration, done: new Promise((res) => (src.onended = res)), stop: () => stops.forEach((s) => { try { s.stop(); } catch {} }) };
}
