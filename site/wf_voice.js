// Wrong Floor — say it out loud. Speech is transcribed ON THIS DEVICE by
// Whisper (whisper-tiny.en, ~40 MB, cached after the first load) through
// transformers.js; the audio never leaves the page, only the words do.
// Pattern from Sticks and Stones (site/body/voice.js), made form-agnostic.
const TJS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1";
const MODEL = "onnx-community/whisper-tiny.en";
let asr = null, loading = null;

async function model(hint) {
  if (asr) return asr;
  if (!loading) loading = (async () => {
    const { pipeline } = await import(TJS);
    let last = -1;
    asr = await pipeline("automatic-speech-recognition", MODEL, { dtype: "q8",
      progress_callback: (p) => { if (p.status === "progress" && p.total > 2e7) { const n = Math.round(p.progress); if (n !== last) { last = n; hint(`loading the ear on your device… ${n}%`); } } } });
    return asr;
  })();
  return loading;
}
async function to16k(blob) {
  const AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
  const buf = await ac.decodeAudioData(await blob.arrayBuffer()); ac.close();
  const n = Math.max(1, Math.round(buf.duration * 16000)), off = new OfflineAudioContext(1, n, 16000);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  return (await off.startRendering()).getChannelData(0);
}

// attach(button, input, onText): toggles recording; puts what it heard in the input
export function attachMic(btn, input, onText) {
  if (!window.MediaRecorder || !navigator.mediaDevices) { btn.hidden = true; return; }
  const rest = input.placeholder, hint = (t) => { input.placeholder = t; };
  let rec = null, chunks = [], timer = 0;
  async function start() {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { hint("no microphone — type instead"); setTimeout(() => hint(rest), 3000); return; }
    model(hint).catch(() => {});                 // warm the ear while you talk
    chunks = []; rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); hear(new Blob(chunks, { type: rec.mimeType })); };
    rec.start(); btn.classList.add("rec"); hint("listening… tap 🎙 again when you're done");
    clearTimeout(timer); timer = setTimeout(stop, 8000);
  }
  function stop() { clearTimeout(timer); if (rec && rec.state === "recording") rec.stop(); btn.classList.remove("rec"); }
  async function hear(blob) {
    btn.classList.add("busy"); btn.disabled = true; hint("hearing you…");
    try {
      const pcm = await to16k(blob);
      let rms = 0; for (let i = 0; i < pcm.length; i++) rms += pcm[i] * pcm[i]; rms = Math.sqrt(rms / pcm.length);
      if (rms < 0.004) { hint("it heard nothing"); return; }
      const out = await (await model(hint))(pcm);
      const text = String(out.text || "").replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
      if (!text || /^(thank you\.?|you|thanks for watching!?)$/i.test(text)) { hint("it couldn't make that out"); return; }
      input.value = text; onText && onText(text);
    } catch (e) { console.warn("voice failed", e); hint("the ear failed to load — type instead"); }
    finally { btn.classList.remove("busy"); btn.disabled = false; setTimeout(() => { if (!btn.classList.contains("rec")) hint(rest); }, 2500); }
  }
  btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (rec && rec.state === "recording") stop(); else start(); });
}
