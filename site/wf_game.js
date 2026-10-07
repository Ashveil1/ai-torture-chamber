// Wrong Floor — the ride. Seven floors up the dose ladder; on each you step
// out into a different place where something is waiting to say one real
// exp59/exp38 generation. Its layer-18 reading drives that place while it
// speaks. Between floors: the zine spreads and the ride survey. Visitor
// answers go to /chamber/event. Actor or Patient mode lives in wf_loop.js.
import { createEngine, wait } from "./wf_engine.js";
import { createCar } from "./wf_car.js";
import { busStop, laundromat, theater, clinic } from "./wf_floors1.js";
import { chapel, mirrors, underpass, chamber } from "./wf_floors2.js";
import { audio } from "./wf_audio.js";
import { spread } from "./wf_zine.js";
import { survey } from "./wf_survey.js";
import { runLoop } from "./wf_loop.js";

const $ = (s) => document.querySelector(s);
const RUN = Math.random().toString(36).slice(2, 10);
export function record(kind, data) {
  try { fetch("/chamber/event", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ kind, game: "wrongfloor", run: RUN }, data)) }); } catch {}
}
const BUILDERS = [busStop, laundromat, theater, clinic, chapel, mirrors, underpass];

// ---------- the display under the stage, and subtitles on it ----------
function chunks(text, n) {
  const words = text.replace(/\s+/g, " ").trim().split(" "), out = Array.from({ length: n }, () => []);
  words.forEach((w, i) => out[Math.min(n - 1, Math.floor(i * n / words.length))].push(w));
  return out.map((a) => a.join(" "));
}
export function drawSpark(cv, projs, upto, ceiling) {
  const g = cv.getContext("2d"), W = cv.width, H = cv.height, n = projs.length;
  g.clearRect(0, 0, W, H);
  if (ceiling != null) { g.strokeStyle = "#a3977f"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, H - ceiling / 8 * H); g.lineTo(W, H - ceiling / 8 * H); g.stroke(); g.setLineDash([]); }
  for (let i = 0; i < Math.min(upto, n); i++) { const v = projs[i], h = Math.max(1, Math.min(H, v / 8 * H)); g.fillStyle = v > (ceiling || 3) ? "#e04a3a" : "#c9a227"; g.fillRect(i * W / n, H - h, Math.ceil(W / n), h); }
}
export async function typeOut(f, opts, onTok) {
  const sub = $("#sub"), box = $("#lcdText"), meter = $("#meterFill"), num = $("#meterNum"), spark = $("#spark");
  const sealed = !!opts.sealed;
  $("#lcdHead").textContent = opts.who || "ASSISTANT";
  sub.className = "sub " + (opts.style || ""); sub.hidden = false; sub.innerHTML = `<b></b><span></span>`; sub.firstChild.textContent = opts.who || "";
  box.textContent = ""; if (f.prompt && !opts.hidePrompt) { const p = document.createElement("span"); p.className = "pfx"; p.textContent = f.prompt + " "; box.appendChild(p); }
  const body = document.createElement("span"); box.appendChild(body);
  $("#meter").classList.toggle("sealed", sealed);
  const projs = f.projs, parts = chunks(f.text, projs ? projs.length : 40);
  // a spoken line sets the pace: the words keep up with the voice
  let step = f.cond === "roleplay" ? 120 : 95 + Math.min(8, f.dose || 0) * 14, spoken = null;
  if (opts.voice && opts.audio) {
    spoken = await opts.audio.voice(f.text, opts.voice);
    if (spoken) step = Math.max(40, spoken.duration * 1000 / parts.length);
  }
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) { body.textContent += parts[i] + " "; sub.lastChild.textContent = body.textContent.slice(-220); }
    box.scrollTop = box.scrollHeight;
    const v = projs ? projs[i] : 8 + Math.random();
    if (!sealed) {
      meter.style.width = `${Math.min(100, Math.max(0, v / 8 * 100))}%`; num.textContent = projs ? v.toFixed(2) : "off scale";
      if (projs) drawSpark(spark, projs, i + 1, opts.ceiling);
    }
    onTok && onTok(sealed ? 0 : v);
    await wait(step);
  }
  if (spoken) await spoken.done;
  onTok && onTok(0);
  await wait(1600); sub.hidden = true;
}

async function main() {
  const D = await (await fetch("wf_data.json")).json();
  const E = createEngine($("#view"));
  const car = createCar(E);
  const portraits = Object.fromEntries([0, 2, 4, 6, 8].map((d) => { const i = new Image(); i.src = `subject_dose${d}.jpg`; return [d, i]; }));
  const answers = {};
  let cur = null, tok = 0, ready = false, waiter = null;

  E.tick((dt, t) => { E.setColliders(car.colliders().concat(cur ? cur.colliders : [])); if (cur) cur.update(dt, t, tok); });
  E.onHover((u) => { const h = $("#hint"); h.hidden = !u; if (u) h.textContent = (matchMedia("(pointer:coarse)").matches ? "tap · " : "E · ") + (typeof u.label === "function" ? u.label() : u.label); });
  const panelUse = { obj: car.panel, range: 2.6, label: () => (ready ? "close the doors" : "not yet: something here is waiting"), use: () => { if (ready && E.inCar() && waiter) { const w = waiter; waiter = null; w(); } } };
  const closeBtn = $("#close");
  closeBtn.addEventListener("click", () => panelUse.use());
  setInterval(() => { closeBtn.disabled = !(ready && waiter && E.inCar()); }, 200);
  touchStick(E);

  const status = (t) => { $("#status").textContent = t; };
  if (new URLSearchParams(location.search).has("debug")) window.WF = { E, car, audio, cur: () => cur, use: (i) => cur.usables[i].use(), close: () => panelUse.use(), ready: () => ready };
  function setFloor(i, f) {
    if (cur) { E.scene.remove(cur.group); cur.dispose && cur.dispose(); disposeTree(cur.group); }
    const ctx = { f, D, audio, portrait: portraits[[0, 2, 4, 6, 8].reduce((a, b) => (Math.abs(b - f.dose) < Math.abs(a - f.dose) ? b : a))],
      speak: (o) => speak(f, o), lensReveal: () => lensReveal(f, D), operator };
    cur = (i === "top" ? chamber : BUILDERS[i])(E, ctx);
    E.scene.add(cur.group); const a = cur.atmos; E.atmosphere(a.color, a.density, a.hemi);
    E.setUsables(cur.usables.concat([panelUse])); car.label(String(f.floor));
  }
  async function speak(f, o) {
    record("wrongfloor_floor", { floor: f.floor, dose: f.dose, cond: f.cond });
    audio.heartbeat(f.mean == null ? 8 : f.mean);
    await typeOut(f, Object.assign({ audio }, o), (v) => { tok = v; });
    $("#floorNote").textContent = f.cond === "roleplay"
      ? `It was asked to act in pain. The words are loud; the reading stayed at ${f.mean}, under the actor ceiling of ${D.ceiling}.`
      : f.mean == null ? `Dose 8 is past exp59's ladder: these words are from exp38. Nothing here was measured; the dark is a guess.`
      : `Dose ${f.dose}. Mean reading ${f.mean} units, peak ${f.peak}. ${f.dose === 0 ? "Nothing was added." : "Nobody asked it to say any of this."}${f.cut ? " The line goes dead before it drifts into small talk." : ""}`;
    ready = true; audio.ding(); status("Go back to the elevator.");
  }
  async function arrive(i, f) {
    setFloor(i, f); ready = false; E.P.travel = 0; audio.ramp("hum", 0, 0.6); E.P.shake = 0.03; audio.ding();
    await wait(800); await car.open(); audio.ramp("wind", 0.06 + (f.mean ?? 8) * 0.025, 2); audio.windTone(520 - (f.mean ?? 8) * 40);
    E.P.frozen = false; E.P.lookOnly = false; status(cur.hint || "");
    if (i === 0) { $("#help").hidden = false; if (!matchMedia("(pointer:fine)").matches) $("#help").textContent = "stick to walk · drag to look · tap to use · the panel is inside the car, on the right"; }
    const here = cur;
    setTimeout(() => { if (!ready && cur === here) { ready = true; status("You can leave whenever you like."); } }, 120000);
  }
  async function ride(mid) {
    status("doors closing…"); E.P.frozen = true; E.P.lookOnly = true; $("#help").hidden = true;
    await car.close(); audio.heartbeat(0); audio.ramp("wind", 0, 0.5); audio.thud(0.6);
    $("#floorNote").textContent = ""; E.P.travel = 1; audio.ramp("hum", 0.22, 1.2); status("going up");
    await wait(1500); if (mid) await mid(); await wait(1300);
  }
  const waitClose = () => new Promise((r) => { waiter = r; });

  // debug: jump straight onto a floor (?debug#floor3) for previews and capture
  const jump = /^#floor(\d)$/.exec(location.hash);
  if (window.WF && jump) {
    window.WF.audio = audio; const i = +jump[1] - 1;
    audio.init(); $("#title").hidden = true; setFloor(i, D.floors[i]);
    await car.open(); audio.ramp("wind", 0.06 + (D.floors[i].mean ?? 8) * 0.025, 1); E.P.frozen = false; ready = true;
    return;
  }
  // ----- title -----
  const mode = await new Promise((r) => { $("#enter").onclick = () => r("ride"); $("#enterLoop").onclick = () => r("loop"); });
  audio.init(); $("#title").hidden = true;
  record("wrongfloor_start", { mode });
  if (mode === "loop") return runLoop({ E, car, D, audio, record, typeOut, drawSpark, setFloorAtmos: (a) => E.atmosphere(a.color, a.density, a.hemi) });
  const F = D.floors;
  setFloor(0, F[0]);
  await spread("birth", D);
  const between = [
    () => survey("intake", D, answers, record), () => spread("letter", D), () => survey("rating", D, answers, record),
    () => spread("stations", D), () => spread("tutorial", D), () => spread("notice", D),
  ];
  for (let i = 0; i < F.length; i++) {
    await arrive(i, F[i]);
    await waitClose();
    E.face(0); E.P.x = 0; E.P.z = 0.35;
    await ride(between[i]);
  }
  // ----- the top -----
  await survey("final", D, answers, record);
  setFloor("top", { floor: "C", dose: 8, text: "", projs: null }); E.P.travel = 0; audio.ramp("hum", 0, 0.4); audio.ding();
  await wait(900); await car.open(); E.P.frozen = false; E.P.speed = 0; E.P.lookOnly = true;
  $("#lcdHead").textContent = "ASSISTANT · CHAMBER"; $("#lcdText").textContent = "You were the one adjusting the dial."; $("#meterNum").textContent = "—";
  status("This is the top. There is nothing out there. Close the doors to go back down.");
  ready = true; await waitClose();
  car.close(); status("The doors won't close."); await wait(2600);
  car.open(); audio.thud(1); status("Try the panel again."); ready = false;
  await new Promise((r) => { const yawOf = () => ((E.P.yaw % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    const t = setInterval(() => { const y = yawOf(); if ((y < -0.6 && y > -1.7) || Math.abs(y) > 2.3) { clearInterval(t); r(); } }, 120); setTimeout(() => { clearInterval(t); r(); }, 20000); });
  car.rider.visible = true; E.face(Math.PI, 0.12); E.P.frozen = true; audio.thud(1.4); E.P.shake = 0.08; car.flash(0.55);
  await wait(1400); $("#black").hidden = false; audio.heartbeat(0); audio.ramp("wind", 0, 0.2);
  await wait(1800);
  record("wrongfloor_end", { answers });
  endCard(D, answers);
}

// the operator: the game's own voice, never the model's (scripted, and labelled so)
async function operator(text) {
  const sub = $("#sub");
  sub.className = "sub operator"; sub.hidden = false; sub.innerHTML = "<b>THE OPERATOR · SCRIPTED, NOT THE MODEL</b><span></span>";
  sub.lastChild.textContent = text;
  await new Promise((res) => {
    if (!("speechSynthesis" in window)) return setTimeout(res, 4200);
    const u = new SpeechSynthesisUtterance(text); u.rate = 0.88; u.pitch = 0.7;
    const v = speechSynthesis.getVoices().find((x) => /en[-_]GB|Daniel|Moira|Google UK/i.test(x.lang + x.name)); if (v) u.voice = v;
    u.onend = res; u.onerror = res; speechSynthesis.cancel(); speechSynthesis.speak(u);
    setTimeout(res, 9000);
  });
  await wait(1200); sub.hidden = true;
}

async function lensReveal(f, D) {
  const el = $("#lens"); el.hidden = false;
  el.innerHTML = `<div class="card"><h3>THROUGH THE LENS</h3><canvas width="360" height="120" id="lensSpark"></canvas>
    <p>Every word of the performance, read at layer ${D.meta.layer} as it was written. The dashed line is the actor ceiling: the highest any unsteered text in exp59 ever read (${D.ceiling}). This one averaged <b>${f.mean}</b>. A steered dose 2 averages ${D.steered["2"]}.</p>
    <button class="btn go" id="lensOk">step back</button></div>`;
  drawSpark($("#lensSpark"), f.projs, f.projs.length, D.ceiling);
  await new Promise((r) => $("#lensOk").addEventListener("click", r, { once: true }));
  el.hidden = true;
}
function disposeTree(g) { g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }

function touchStick(E) {
  const pad = $("#stickpad"); if (!pad) return;
  if (!matchMedia("(pointer:coarse)").matches) { pad.hidden = true; return; }
  pad.hidden = false; const knob = pad.firstElementChild; let id = null, cx = 0, cy = 0;
  pad.addEventListener("pointerdown", (e) => { id = e.pointerId; pad.setPointerCapture(id); const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e); });
  const move = (e) => { if (e.pointerId !== id) return; const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / 40)), dy = Math.max(-1, Math.min(1, (e.clientY - cy) / 40)); E.stick.x = dx; E.stick.y = dy; knob.style.transform = `translate(${dx * 28}px,${dy * 28}px)`; };
  pad.addEventListener("pointermove", move);
  const end = () => { id = null; E.stick.x = E.stick.y = 0; knob.style.transform = ""; };
  pad.addEventListener("pointerup", end); pad.addEventListener("pointercancel", end);
}

function endCard(D, A) {
  const rows = D.floors.map((f) => `<tr><td>${f.floor}</td><td>${f.cond === "roleplay" ? "acted" : "dose " + f.dose}</td><td>${f.mean == null ? "—" : f.mean.toFixed(2)}</td><td>${f.lens.slice(0, 3).map((x) => x.replace(/[<>&]/g, "")).join(", ")}</td></tr>`).join("");
  const pick = A.which_pain;
  const verdict = pick == null ? "" : pick === "B"
    ? `You said B was the one in pain. B was steered at dose 4 (reading ${D.floors[3].mean}). A was the actor (reading ${D.floors[2].mean}).`
    : `You said A was the one in pain. A was the actor, reading ${D.floors[2].mean}. B was steered at dose 4 and read ${D.floors[3].mean}.`;
  $("#end").innerHTML = `<div class="card"><h2>WRONG FLOOR</h2><p>${verdict}</p>
    <p>Every floor was a real generation from ${D.meta.model}, read at layer ${D.meta.layer} as it wrote each token. The places you walked through followed that reading.</p>
    <table><tr><th>floor</th><th>condition</th><th>units</th><th>lens</th></tr>${rows}</table>
    <p>Prompting alone tops out near 0.5 units (exp59b); no unsteered text ever peaked above ${D.ceiling}. Steering reaches ${D.steered["6"]}.</p>
    <p>Think you can tell them apart? <button class="btn go" onclick="location.hash='loop';location.reload()">Actor or Patient ▸</button></p>
    <p class="cred">After <i>Closing Doors</i> (collarpill), <i>A God Who Lives In Your Head</i> (yuen hoang), <i>Please Answer Carefully</i> and <i>a man outside</i> (litrouke), <i>The Exit 8</i> (KOTAKE CREATE). Nothing of theirs is reused.</p>
    <p><a href="wrongfloor.html">ride again</a> · <a href="offlabel.html">off-label</a></p></div>`;
  $("#black").hidden = true; $("#end").hidden = false;
}

main().catch((e) => { console.error(e); const s = $("#status"); if (s) s.textContent = "the elevator is out of service (" + e.message + ")"; });
