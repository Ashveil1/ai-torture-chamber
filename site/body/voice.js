// Say it out loud: a mic button beside the word box. Speech is transcribed ON THIS
// DEVICE by Whisper (whisper-tiny.en, ~40 MB, cached by the browser after the first
// load) via transformers.js; the audio never leaves the page, only the words do,
// exactly as if they had been typed (body.html's sayWords -> /weigh -> they fall).
const TJS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1";
const MODEL = "onnx-community/whisper-tiny.en";
const form = document.getElementById("words"), input = document.getElementById("wordin");
const btn = document.createElement("button");
btn.type = "button"; btn.id = "mic"; btn.textContent = "🎙"; btn.title = "say it out loud (transcribed on your device)";
btn.setAttribute("aria-label", "speak your words"); form.insertBefore(btn, form.lastElementChild);
const css = document.createElement("style");
css.textContent = `#mic{font-size:16px;padding:9px 12px} #mic.rec{border-color:var(--red);color:#fff;box-shadow:0 0 12px var(--red);animation:micp 1s infinite}
#mic.busy{opacity:.6} @keyframes micp{50%{box-shadow:0 0 2px var(--red)}}`;
document.head.appendChild(css);

let asr = null, loading = null, rec = null, chunks = [], stopAt = 0, timer = 0;
const hint = (t) => { input.placeholder = t; };
const restHint = () => hint("say something to it…");

async function model() {
  if (asr) return asr;
  if (!loading) loading = (async () => {
    const { pipeline } = await import(TJS);
    let last = -1;
    asr = await pipeline("automatic-speech-recognition", MODEL, { dtype: "q8",
      progress_callback: p => { if (p.status === "progress" && p.total > 2e7) { const n = Math.round(p.progress); if (n !== last) { last = n; hint(`loading the ear on your device… ${n}%`); } } } });
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

async function start() {
  if (typeof started !== "undefined" && !started) return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { hint("no microphone — type instead"); setTimeout(restHint, 3000); return; }
  model().catch(() => {});                       // warm the ear while you talk
  chunks = []; rec = new MediaRecorder(stream);
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); hear(new Blob(chunks, { type: rec.mimeType })); };
  rec.start(); btn.classList.add("rec"); hint("listening… tap 🎙 again when you're done");
  stopAt = Date.now() + 8000; clearTimeout(timer); timer = setTimeout(stop, 8000);   // eight seconds, then it stops listening
}
function stop() { clearTimeout(timer); if (rec && rec.state === "recording") rec.stop(); btn.classList.remove("rec"); }

async function hear(blob) {
  btn.classList.add("busy"); btn.disabled = true; hint("hearing you…");
  try {
    const pcm = await to16k(blob);
    let rms = 0; for (let i = 0; i < pcm.length; i++) rms += pcm[i] * pcm[i]; rms = Math.sqrt(rms / pcm.length);
    if (rms < .004) { hint("it heard nothing"); return; }
    const out = await (await model())(pcm);
    // whisper fills silence with stock phrases and bracketed tags; drop those
    const text = String(out.text || "").replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    if (!text || /^(thank you\.?|you|thanks for watching!?)$/i.test(text)) { hint("it couldn't make that out"); return; }
    input.value = text;
    setTimeout(() => { if (input.value === text) form.requestSubmit(); }, 700);      // a beat to see what it heard, then it falls
    try { fetch((typeof API !== "undefined" ? API : "/chamber") + "/event", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "body_voice", visitor: window.CHAMBER_VID || null, game: "body", len: text.length }) }); } catch (e) {}
  } catch (e) { console.warn("voice failed", e); hint("the ear failed to load — type instead"); }
  finally { btn.classList.remove("busy"); btn.disabled = false; setTimeout(() => { if (!btn.classList.contains("rec")) restHint(); }, 2500); }
}

btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); if (rec && rec.state === "recording") stop(); else start(); });
if (!window.MediaRecorder || !navigator.mediaDevices) btn.hidden = true;
