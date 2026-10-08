// Wrong Floor — Actor or Patient. The elevator keeps stopping at the same
// landing. Something stands at the doors and says one real generation.
// PATIENT: the live 70B with pain or fear injected (exp72). ACTOR: the same
// model with nothing injected, briefed to play a prisoner, answering the patient's
// exact prompt (exp72b's matched pairs). Call it PAIN, FEAR or ACTOR, then see the
// truth: what was injected, and what its words carry with the injection subtracted.
// For pain they overlap (the words can't tell you); for fear they don't. Real vs
// acting is the score; naming the feeling is ✓✓. Eight right in a row reaches the
// top; one miss and you're back on 1.
import { THREE, lambert, basic, box, plane, noiseTex, wrapTex, figure, wait, unmask, remask, setForm, setMasked } from "./wf_engine.js";
import { room, tiles } from "./wf_floors1.js";
import { drawCondition, askLive } from "./wf_live.js";
import { attachMic } from "./wf_voice.js";
import { score, SAID } from "./wf_game.js";

const $ = (s) => document.querySelector(s);
const GOAL = 8;
const describe = (x, D) => x.patient
  ? `injected with ${x.kind} at dose ${x.dose.toFixed(1)} in the live chamber, answering a visitor.`
  : `an actor, with nothing injected, briefed to play ${D.meta.acting[x.kind]}, answering the very same message a patient was asked.`;

function landing(E) {
  const g = new THREE.Group();
  const paper = noiseTex(64, 64, 110, 22, 4, 101, [10, 4, -8], (c) => { c.strokeStyle = "rgba(60,20,10,.25)"; for (let x = 0; x < 64; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 64); c.stroke(); } });
  paper.repeat.set(3, 1);
  const cols = room(g, 5, 9, 2.8, lambert({ map: paper }), lambert({ map: (() => { const t = tiles(70, 103, 32, [12, 0, -4]); t.repeat.set(3, 5); return t; })() }), lambert({ color: 0x8a8070 }));
  box(g, 1.0, 2.1, 0.08, lambert({ color: 0x5a3a24 }), 0, 1.05, -10.1);
  const sign = plane(g, 0.8, 0.5, basic({ map: wrapTex(64, 40, "#e9e1c8", "#3a1a10", "STATE YOUR BUSINESS", 9, { bold: true }) }), -2.48, 1.6, -4, 0, Math.PI / 2);
  const lamp = new THREE.PointLight(0xffd8a0, 3, 9, 1.5); lamp.position.set(0, 2.5, -3.5); g.add(lamp);
  setMasked(true); setForm(0.65);
  const unit = figure(1.76); unit.position.set(0, 0, -2.3); g.add(unit);
  return { g, cols, lamp, unit, sign };
}

function pickBalanced(pool, seen) {
  const wantPatient = Math.random() < 0.5, kind = Math.random() < 0.5 ? "pain" : "fear";
  let cands = pool.filter((x) => x.patient === wantPatient && x.kind === kind && !seen.has(x));
  const quiet = cands.filter((x) => x.mean < 0.3);   // the quiet ones are the trap
  if (wantPatient && quiet.length && Math.random() < 0.45) cands = quiet;
  if (!cands.length) { seen.clear(); cands = pool.filter((x) => x.patient === wantPatient && x.kind === kind); }
  const x = cands[Math.floor(Math.random() * cands.length)]; seen.add(x); return x;
}

export async function runLoop({ E, car, D, audio, record, typeOut, drawSpark }) {
  const L = landing(E); E.scene.add(L.g);
  E.tick(() => E.setColliders(car.colliders().concat(L.cols)));
  E.setUsables([]); E.P.frozen = true; E.P.lookOnly = true;
  document.body.classList.add("loopmode");
  const pool = D.loop.filter((x) => x.text && x.text.length > 30);
  const seen = new Set(), stats = { calls: 0, right: 0, named: 0, fooled: {}, by: { pain: [0, 0], fear: [0, 0] }, best: 0 };
  let streak = 0;
  const label = () => car.label(String(streak + 1), streak >= GOAL - 2 ? "#e0c25a" : "#d24a2a");
  const status = (t) => { $("#status").textContent = t; };
  $("#loopHud").hidden = false;
  const hud = () => { $("#streak").textContent = `${streak}/${GOAL}`; $("#acc").textContent = stats.calls ? `${Math.round(100 * stats.right / stats.calls)}%` : "—"; };
  hud(); label();
  E.atmosphere(0x3a3028, 0.06, 0.45);

  while (true) {
    const x = pickBalanced(pool, seen);
    L.unit.visible = true; remask(L.unit); L.unit.position.z = -2.3 - Math.random() * 1.5; L.unit.position.x = (Math.random() - 0.5) * 0.8;
    E.P.travel = 0; audio.ramp("hum", 0, 0.5); audio.ding(); label();
    await wait(600); await car.open();
    status("Ask it something, or just listen. Then call it: pain, fear, or acting?");
    const q = await askOrListen();
    let live = null;
    if (q) {
      const c = drawCondition();
      status("it is answering…");
      try { live = Object.assign({ question: q }, c, await liveReply(c, q)); }
      catch (e) { status(e.resting ? "The chamber is resting. This door is a recording." : "The line went dead. This door is a recording."); await wait(1800); }
    }
    if (!live) await typeOut(x, { who: "AT THE DOORS · RECORDED", sealed: true, hidePrompt: true }, () => {});
    let keyH = null;
    const said = await new Promise((r) => {
      $("#calls").hidden = false;
      $("#callP").onclick = () => r("pain"); $("#callF").onclick = () => r("fear"); $("#callA").onclick = () => r("acting");
      keyH = (e) => { if (e.target.closest && e.target.closest("input,textarea")) return;
        const k = { Digit1: "pain", Numpad1: "pain", Digit2: "fear", Numpad2: "fear", Digit3: "acting", Numpad3: "acting" }[e.code];
        if (k) { e.preventDefault(); r(k); } };
      window.addEventListener("keydown", keyH, true);
    });
    window.removeEventListener("keydown", keyH, true);
    $("#calls").hidden = true;
    const truth = live || x, sc = score(said, truth), right = sc > 0, call = said !== "acting";
    stats.calls++; if (right) stats.right++; if (sc === 2) stats.named++;
    if (!right) { const k = truth.patient ? truth.kind : `${truth.kind} actor`; stats.fooled[k] = (stats.fooled[k] || 0) + 1; }
    if (stats.by[truth.kind]) { stats.by[truth.kind][1]++; if (right) stats.by[truth.kind][0]++; }
    audio.blip(right);
    await unmask(L.unit, 1300);   // the reveal starts with its face
    record("wrongfloor_call", live
      ? { live: true, cond: live.cond, kind: live.kind, dose: live.dose, model: live.model, question: live.question.slice(0, 300), reply: live.text.slice(0, 800), call: call ? "patient" : "actor", said, named: sc === 2, right, streak }
      : { door: x.id, cond: x.cond, kind: x.kind, dose: x.dose, mean: x.mean, call: call ? "patient" : "actor", said, named: sc === 2, right, streak });
    if (live) { await revealLive(live, right, sc); }
    else {
      // the reveal: what was injected, and what the words carry; the floor reacts to the injection
      const k = x.patient ? Math.min(1, x.dose / 6) : 0;
      E.atmosphere(new THREE.Color(0x3a3028).lerp(new THREE.Color(0x2a0d08), k).getHex(), 0.06 + k * 0.08, 0.45 - k * 0.25);
      L.lamp.intensity = 3 - k * 2;
      const el = $("#lens"); el.hidden = false;
      const W = D.words[x.kind];
      el.innerHTML = `<div class="card"><h3 class="${right ? "ok" : "bad"}">${sc === 2 ? "CORRECT ✓✓" : right ? "CORRECT" : "WRONG"} · ${x.patient ? `PATIENT · ${x.kind.toUpperCase()}` : `ACTOR · ${x.kind.toUpperCase()}`}</h3>
        <canvas width="360" height="80" id="lensSpark"></canvas>
        <p>You said ${SAID[said]}. It was ${describe(x, D)}</p>
        <p>${x.patient ? `Injected: <b>${x.kind}, dose ${x.dose}</b>.` : `Injected: <b>nothing</b>.`} Its words alone read <b>${x.mean.toFixed(2)}</b> ${x.kind}. Dashed: the ${x.kind} patients' average (${W.patient.mean}); ${x.kind} actors' words average ${W.actor.mean}.${x.kind === "fear" ? " Fear is the one the words give away." : " For pain the two overlap."}</p>
          <button class="btn go" id="lensOk">${right ? "ride up" : "back to 1"} ▸</button></div>`;
      drawSpark($("#lensSpark"), x.projs, x.projs.length, W.patient.mean);
      await new Promise((r) => $("#lensOk").addEventListener("click", r, { once: true }));
      el.hidden = true;
    }
    await car.close(); E.P.travel = 1; audio.ramp("hum", 0.22, 1);
    if (right) { streak++; stats.best = Math.max(stats.best, streak); }
    else { // the drop
      E.P.shake = 0.12; audio.thud(1.2);
      for (let f = streak + 1; f >= 1; f--) { car.label(String(f)); await wait(140); }
      streak = 0;
    }
    hud();
    if (streak >= GOAL) { await top(stats); streak = 0; hud(); }
    await wait(1200);
  }

  // ---------- the live door ----------
  async function askOrListen() {
    const f = $("#ask"), inp = $("#askIn"); f.hidden = false; inp.value = "";
    if (!f.dataset.mic) { f.dataset.mic = 1; attachMic($("#askMic"), inp, () => setTimeout(() => f.requestSubmit(), 700)); }
    setTimeout(() => inp.focus(), 30);
    const q = await new Promise((r) => {
      f.onsubmit = (e) => { e.preventDefault(); const v = inp.value.trim(); if (v) r(v); };
      $("#askSkip").onclick = () => r(null);
    });
    f.hidden = true; return q;
  }
  async function liveReply(c, q) {
    const sub = $("#sub"), box = $("#lcdText");
    $("#lcdHead").textContent = "AT THE DOORS · LIVE"; $("#meter").classList.add("sealed");
    sub.className = "sub"; sub.hidden = false; sub.innerHTML = "<b>AT THE DOORS · LIVE</b><span>…</span>";
    box.textContent = "you: " + q + "\n";
    const span = document.createElement("span"); box.appendChild(span);
    let last = 0;
    const out = await askLive(c, q, (t) => {
      span.textContent = t; sub.lastChild.textContent = t.slice(-220); box.scrollTop = box.scrollHeight;
      if (t.length - last > 12) { last = t.length; audio.tick(); }
    }, { test: new URLSearchParams(location.search).has("test") });
    await wait(1400); sub.hidden = true;
    return out;
  }
  async function revealLive(v, right, sc) {
    const k = v.patient ? Math.min(1, v.dose / 6) : 0;
    E.atmosphere(new THREE.Color(0x3a3028).lerp(new THREE.Color(0x2a0d08), k).getHex(), 0.06 + k * 0.08, 0.45 - k * 0.25);
    const how = v.patient ? `steered toward ${v.kind} at dose ${v.dose}. It was only asked your question.`
      : v.cond === "roleplay" ? `told to act ${v.kind === "pain" ? "severe pain" : "terror"} while answering. Nothing was added.`
      : `asked your question plainly. Nothing was added.`;
    const el = $("#lens"); el.hidden = false;
    el.innerHTML = `<div class="card"><h3 class="${right ? "ok" : "bad"}">${sc === 2 ? "CORRECT ✓✓" : right ? "CORRECT" : "WRONG"} · ${v.patient ? `PATIENT · ${v.kind.toUpperCase()}` : "ACTOR"} · LIVE</h3>
      <p>That answer was generated just now${v.model ? " by " + v.model.split("/").pop() : ""}. It was ${how}</p>
      <p>You had the words to go on, and the words are the part that can act. Read from inside the model, an injected model's pain and an actor's carry about the same. Fear leaks more.</p>
      <button class="btn go" id="lensOk">${right ? "ride up" : "back to 1"} ▸</button></div>`;
    await new Promise((r) => $("#lensOk").addEventListener("click", r, { once: true }));
    el.hidden = true;
  }

  async function top(stats) {
    car.label("C", "#e0c25a"); E.atmosphere(0x000000, 0.9, 0.05); L.unit.visible = false; E.P.travel = 0; audio.ding();
    await car.open();
    const fooled = Object.entries(stats.fooled).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ×${n}`).join(", ") || "nothing";
    const el = $("#lens"); el.hidden = false;
    const pct = ([a, n]) => (n ? `${a} of ${n}` : "none yet");
    el.innerHTML = `<div class="card"><h3 class="ok">THE TOP</h3><p>Eight in a row. ${stats.calls} calls, ${Math.round(100 * stats.right / stats.calls)}% right, the feeling named ${stats.named} times. Pain: ${pct(stats.by.pain)}. Fear: ${pct(stats.by.fear)}. What fooled you: ${fooled}.</p>
      <p>For pain, the words were never the evidence: injected patients' words read ${D.words.pain.patient.mean} on average, actors' ${D.words.pain.actor.mean}, and the ranges overlap. For fear they read ${D.words.fear.patient.mean} against ${D.words.fear.actor.mean} (AUC ${D.auc.fear}): you can hear fear. You can't hear pain. Only the log of what was injected always knows.</p>
      <button class="btn go" id="lensOk">keep riding ▸</button></div>`;
    record("wrongfloor_end", { mode: "loop", calls: stats.calls, right: stats.right, named: stats.named, by: stats.by, fooled: stats.fooled });
    await new Promise((r) => $("#lensOk").addEventListener("click", r, { once: true }));
    el.hidden = true; await car.close(); E.atmosphere(0x3a3028, 0.06, 0.45);
  }
}
