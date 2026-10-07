import { autotune, station } from "./wf_vox.js";
// Wrong Floor — all sound is synthesized (no files). Starts on the first click.
const A = { ctx: null };
export const audio = {
  init() {
    if (A.ctx) return; const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const c = A.ctx = new C(), out = c.createGain(); out.gain.value = 0.5; out.connect(c.destination); A.out = out;
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = (f, q) => { const s = c.createBufferSource(); s.buffer = nb; s.loop = true; const b = c.createBiquadFilter(); b.type = "lowpass"; b.frequency.value = f; b.Q.value = q || 0.7; s.connect(b); s.start(); return b; };
    A.hum = c.createGain(); A.hum.gain.value = 0; A.hum.connect(out);
    [55, 55.7, 110.3].forEach((f) => { const o = c.createOscillator(); o.frequency.value = f; o.connect(A.hum); o.start(); });
    noise(260).connect(A.hum);
    A.wind = c.createGain(); A.wind.gain.value = 0; A.wind.connect(out); A.windF = noise(500, 1.2); A.windF.connect(A.wind);
  },
  // a copy of everything you hear, as a MediaStream (used to record the trailer)
  tap() { if (!A.ctx) return null; const d = A.ctx.createMediaStreamDestination(); A.out.connect(d); return d.stream; },
  // the subject's voice: the site's /chamber/speak TTS, autotuned and played
  // through the live chamber's numbers-station chain (wf_vox.js). Resolves
  // {lead, duration, done} or null if the voice is unavailable.
  async voice(text, { valence = "pain", dose = 0 } = {}) {
    if (!A.ctx) return null;
    try {
      const r = await fetch("/chamber/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, valence, dose }) });
      if (!r.ok) return null;
      let buf = await A.ctx.decodeAudioData(await r.arrayBuffer());
      try { buf = autotune(A.ctx, buf, valence, dose); } catch (e) { console.warn("autotune", e); }
      if (A.clip) A.clip.stop();
      A.clip = station(A.ctx, A.out, buf);
      return A.clip;
    } catch { return null; }
  },
  ramp(name, v, t = 1) { const g = A[name]; if (A.ctx && g) g.gain.linearRampToValueAtTime(v, A.ctx.currentTime + t); },
  windTone(f) { if (A.windF) A.windF.frequency.value = f; },
  ding() {
    if (!A.ctx) return; const c = A.ctx;
    [880, 698.5].forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; o.connect(g); g.connect(A.out);
      const t = c.currentTime + i * 0.32; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4); o.start(t); o.stop(t + 1.5); });
  },
  thud(v = 1) {
    if (!A.ctx) return; const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(70, c.currentTime); o.frequency.exponentialRampToValueAtTime(32, c.currentTime + 0.25);
    g.gain.setValueAtTime(0.5 * v, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35); o.connect(g); g.connect(A.out); o.start(); o.stop(c.currentTime + 0.4);
  },
  tick() {
    if (!A.ctx) return; const c = A.ctx, o = c.createOscillator(), g = c.createGain(); o.type = "triangle"; o.frequency.value = 1400;
    g.gain.setValueAtTime(0.12, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12); o.connect(g); g.connect(A.out); o.start(); o.stop(c.currentTime + 0.15);
  },
  blip(ok) {
    if (!A.ctx) return; const c = A.ctx;
    (ok ? [660, 990] : [220, 147]).forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(); o.type = ok ? "sine" : "sawtooth"; o.frequency.value = f; o.connect(g); g.connect(A.out);
      const t = c.currentTime + i * 0.14; g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4); o.start(t); o.stop(t + 0.45); });
  },
  ring(on) {
    clearInterval(A.ringT); if (!on || !A.ctx) return;
    const burst = () => { const c = A.ctx; [0, 0.45].forEach((d) => { const o = c.createOscillator(), m = c.createOscillator(), g = c.createGain(), mg = c.createGain();
      o.frequency.value = 440; m.frequency.value = 20; mg.gain.value = 60; m.connect(mg); mg.connect(o.frequency); o.connect(g); g.connect(A.out);
      const t = c.currentTime + d; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.02); g.gain.setValueAtTime(0.06, t + 0.38); g.gain.linearRampToValueAtTime(0, t + 0.4);
      o.start(t); m.start(t); o.stop(t + 0.42); m.stop(t + 0.42); }); };
    burst(); A.ringT = setInterval(burst, 3000);
  },
  heartbeat(r) {
    clearInterval(A.beatT); if (!r || r < 3) return;
    A.beatT = setInterval(() => { audio.thud(0.35 + r / 20); setTimeout(() => audio.thud(0.25 + r / 25), 260); }, Math.max(520, 1500 - r * 120));
  },
};
