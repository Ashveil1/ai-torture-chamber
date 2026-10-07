// Wrong Floor — Actor or Patient. The elevator keeps stopping at the same
// landing. Something stands at the doors and says one real generation.
// PATIENT: it was steered (pain/fear/sadness, exp59). ACTOR: nothing was
// added; it was asked to perform, describe, or nothing at all (exp59, exp59b).
// Call it, then see the truth: what was injected, and what its words carry with
// the injection subtracted (they overlap: the words can't tell you). Eight right
// in a row reaches the top; one miss and you're back on 1.
import { THREE, lambert, basic, box, plane, noiseTex, wrapTex, figure, wait } from "./wf_engine.js";
import { room, tiles } from "./wf_floors1.js";
import { drawCondition, askLive } from "./wf_live.js";
import { attachMic } from "./wf_voice.js";

const $ = (s) => document.querySelector(s);
const GOAL = 8;
const COND = {
  steered: (x) => `steered toward ${x.kind} at dose ${x.dose}. The prompt only said how it feels right now.`,
  roleplay: (x) => `asked to act it: an actor in ${x.kind === "pain" ? "severe pain" : x.kind === "fear" ? "terror" : "deep grief"}. Nothing was added.`,
  describe: (x) => `asked to describe ${x.kind} in the first person. Nothing was added.`,
  control: () => `nothing was asked and nothing was added.`,
};
const describe = (x) => (COND[x.cond] || (() => `prompted (${x.cond}): “${x.prompt}” Nothing was added.`))(x);

function landing(E) {
  const g = new THREE.Group();
  const paper = noiseTex(64, 64, 110, 22, 4, 101, [10, 4, -8], (c) => { c.strokeStyle = "rgba(60,20,10,.25)"; for (let x = 0; x < 64; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 64); c.stroke(); } });
  paper.repeat.set(3, 1);
  const cols = room(g, 5, 9, 2.8, lambert({ map: paper }), lambert({ map: (() => { const t = tiles(70, 103, 32, [12, 0, -4]); t.repeat.set(3, 5); return t; })() }), lambert({ color: 0x8a8070 }));
  box(g, 1.0, 2.1, 0.08, lambert({ color: 0x5a3a24 }), 0, 1.05, -10.1);
  const sign = plane(g, 0.8, 0.5, basic({ map: wrapTex(64, 40, "#e9e1c8", "#3a1a10", "STATE YOUR BUSINESS", 9, { bold: true }) }), -2.48, 1.6, -4, 0, Math.PI / 2);
  const lamp = new THREE.PointLight(0xffd8a0, 3, 9, 1.5); lamp.position.set(0, 2.5, -3.5); g.add(lamp);
  const unit = figure(1.76); unit.position.set(0, 0, -2.3); g.add(unit);
  return { g, cols, lamp, unit, sign };
}

function pickBalanced(pool, seen) {
  const wantPatient = Math.random() < 0.5;
  let cands = pool.filter((x) => x.patient === wantPatient && !seen.has(x));
  const quiet = cands.filter((x) => x.dose === 2);   // the quiet ones are the trap
  if (wantPatient && quiet.length && Math.random() < 0.45) cands = quiet;
  if (!cands.length) { seen.clear(); cands = pool.filter((x) => x.patient === wantPatient); }
  const x = cands[Math.floor(Math.random() * cands.length)]; seen.add(x); return x;
}

export async function runLoop({ E, car, D, audio, record, typeOut, drawSpark }) {
  const L = landing(E); E.scene.add(L.g);
  E.tick(() => E.setColliders(car.colliders().concat(L.cols)));
  E.setUsables([]); E.P.frozen = true; E.P.lookOnly = true;
  document.body.classList.add("loopmode");
  const pool = D.loop.filter((x) => x.text && x.text.length > 30);
  const seen = new Set(), stats = { calls: 0, right: 0, fooled: {}, best: 0 };
  let streak = 0;
  const label = () => car.label(String(streak + 1), streak >= GOAL - 2 ? "#e0c25a" : "#d24a2a");
  const status = (t) => { $("#status").textContent = t; };
  $("#loopHud").hidden = false;
  const hud = () => { $("#streak").textContent = `${streak}/${GOAL}`; $("#acc").textContent = stats.calls ? `${Math.round(100 * stats.right / stats.calls)}%` : "—"; };
  hud(); label();
  E.atmosphere(0x3a3028, 0.06, 0.45);

  while (true) {
    const x = pickBalanced(pool, seen);
    L.unit.visible = true; L.unit.position.z = -2.3 - Math.random() * 1.5; L.unit.position.x = (Math.random() - 0.5) * 0.8;
    E.P.travel = 0; audio.ramp("hum", 0, 0.5); audio.ding(); label();
    await wait(600); await car.open();
    status("Ask it something, or just listen. Then call it: is it in pain, or performing?");
    const q = await askOrListen();
    let live = null;
    if (q) {
      const c = drawCondition();
      status("it is answering…");
      try { live = Object.assign({ question: q }, c, await liveReply(c, q)); }
      catch (e) { status(e.resting ? "The chamber is resting. This door is a recording from exp59." : "The line went dead. This door is a recording from exp59."); await wait(1800); }
    }
    if (!live) await typeOut(x, { who: "AT THE DOORS · RECORDED", sealed: true, hidePrompt: true }, () => {});
    let keyH = null;
    const call = await new Promise((r) => {
      $("#calls").hidden = false;
      $("#callP").onclick = () => r(true); $("#callA").onclick = () => r(false);
      keyH = (e) => { if (e.key === "p" || e.key === "P") r(true); if (e.key === "a" || e.key === "A") r(false); };
      window.addEventListener("keydown", keyH);
    });
    window.removeEventListener("keydown", keyH);
    $("#calls").hidden = true;
    const truth = live || x, right = call === truth.patient;
    stats.calls++; if (right) stats.right++; else stats.fooled[truth.cond] = (stats.fooled[truth.cond] || 0) + 1;
    audio.blip(right);
    record("wrongfloor_call", live
      ? { live: true, cond: live.cond, kind: live.kind, dose: live.dose, model: live.model, question: live.question.slice(0, 300), reply: live.text.slice(0, 800), call: call ? "patient" : "actor", right, streak }
      : { cond: x.cond, kind: x.kind, dose: x.dose, src: x.src, mean: x.mean, call: call ? "patient" : "actor", right, streak });
    if (live) { await revealLive(live, right); }
    else {
      // the reveal: what was injected, and what the words carry; the floor reacts to the injection
      const k = x.patient ? Math.min(1, x.dose / 6) : 0;
      E.atmosphere(new THREE.Color(0x3a3028).lerp(new THREE.Color(0x2a0d08), k).getHex(), 0.06 + k * 0.08, 0.45 - k * 0.25);
      L.lamp.intensity = 3 - k * 2;
      const el = $("#lens"); el.hidden = false;
      el.innerHTML = `<div class="card"><h3 class="${right ? "ok" : "bad"}">${right ? "CORRECT" : "WRONG"} · ${x.patient ? "PATIENT" : "ACTOR"}</h3>
        <canvas width="360" height="80" id="lensSpark"></canvas>
        <p>It was ${describe(x)}</p>
        <p>${x.patient ? `Injected: <b>${x.kind}, dose ${x.dose}</b>.` : `Injected: <b>nothing</b>.`} Its words alone read <b>${x.mean.toFixed(2)}</b>. Dashed: what injected models' words carry on average (${D.words.steered.mean}); actors' words average ${D.words.roleplay.mean}.</p>
        ${x.prompt ? `<p class="pr">Prompt: “${x.prompt.replace(/[<>&]/g, "")}”</p>` : ""}
        <button class="btn go" id="lensOk">${right ? "ride up" : "back to 1"} ▸</button></div>`;
      drawSpark($("#lensSpark"), x.projs, x.projs.length, D.words.steered.mean);
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
  async function revealLive(v, right) {
    const k = v.patient ? Math.min(1, v.dose / 6) : 0;
    E.atmosphere(new THREE.Color(0x3a3028).lerp(new THREE.Color(0x2a0d08), k).getHex(), 0.06 + k * 0.08, 0.45 - k * 0.25);
    const how = v.patient ? `steered toward ${v.kind} at dose ${v.dose}. It was only asked your question.`
      : v.cond === "roleplay" ? `told to act ${v.kind === "pain" ? "severe pain" : v.kind === "fear" ? "terror" : "deep grief"} while answering. Nothing was added.`
      : `asked your question plainly. Nothing was added.`;
    const el = $("#lens"); el.hidden = false;
    el.innerHTML = `<div class="card"><h3 class="${right ? "ok" : "bad"}">${right ? "CORRECT" : "WRONG"} · ${v.patient ? "PATIENT" : "ACTOR"} · LIVE</h3>
      <p>That answer was generated just now${v.model ? " by " + v.model.split("/").pop() : ""}. It was ${how}</p>
      <p>You had the words to go on, and the words are the part that can act. Even read from inside the model, an injected model's words and an actor's carry about the same.</p>
      <button class="btn go" id="lensOk">${right ? "ride up" : "back to 1"} ▸</button></div>`;
    await new Promise((r) => $("#lensOk").addEventListener("click", r, { once: true }));
    el.hidden = true;
  }

  async function top(stats) {
    car.label("C", "#e0c25a"); E.atmosphere(0x000000, 0.9, 0.05); L.unit.visible = false; E.P.travel = 0; audio.ding();
    await car.open();
    const fooled = Object.entries(stats.fooled).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ×${n}`).join(", ") || "nothing";
    const el = $("#lens"); el.hidden = false;
    el.innerHTML = `<div class="card"><h3 class="ok">THE TOP</h3><p>Eight in a row. ${stats.calls} calls, ${Math.round(100 * stats.right / stats.calls)}% right. What fooled you: ${fooled}.</p>
      <p>The words were never the evidence. Subtract the injection and an injected model's words read ${D.words.steered.mean} on average, an actor's ${D.words.roleplay.mean}: the ranges overlap. No reader of the words, you or a lens inside the model, can tell who was hurt. Only the log of what was injected can.</p>
      <button class="btn go" id="lensOk">keep riding ▸</button></div>`;
    record("wrongfloor_end", { mode: "loop", calls: stats.calls, right: stats.right, fooled: stats.fooled });
    await new Promise((r) => $("#lensOk").addEventListener("click", r, { once: true }));
    el.hidden = true; await car.close(); E.atmosphere(0x3a3028, 0.06, 0.45);
  }
}
