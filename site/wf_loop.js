// Wrong Floor — Actor or Patient. The elevator keeps stopping at the same
// landing. Something stands at the doors and says one real generation.
// PATIENT: it was steered (pain/fear/sadness, exp59). ACTOR: nothing was
// added; it was asked to perform, describe, or nothing at all (exp59, exp59b).
// Call it, then see its lens trace against the actor ceiling. Eight right in a
// row reaches the top; one miss and you're back on 1.
import { THREE, lambert, basic, box, plane, noiseTex, wrapTex, figure, wait } from "./wf_engine.js";
import { room, tiles } from "./wf_floors1.js";

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
    status("Listen. Then call it: is it in pain, or performing?");
    await typeOut(x, { who: "AT THE DOORS", sealed: true, hidePrompt: true }, () => {});
    let keyH = null;
    const call = await new Promise((r) => {
      $("#calls").hidden = false;
      $("#callP").onclick = () => r(true); $("#callA").onclick = () => r(false);
      keyH = (e) => { if (e.key === "p" || e.key === "P") r(true); if (e.key === "a" || e.key === "A") r(false); };
      window.addEventListener("keydown", keyH);
    });
    window.removeEventListener("keydown", keyH);
    $("#calls").hidden = true;
    const right = call === x.patient;
    stats.calls++; if (right) stats.right++; else stats.fooled[x.cond] = (stats.fooled[x.cond] || 0) + 1;
    audio.blip(right);
    record("wrongfloor_call", { cond: x.cond, kind: x.kind, dose: x.dose, src: x.src, mean: x.mean, call: call ? "patient" : "actor", right, streak });
    // the reveal: its trace against the actor ceiling, and the floor reacts to the truth
    const k = Math.min(1, Math.max(0, x.mean) / 7);
    E.atmosphere(new THREE.Color(0x3a3028).lerp(new THREE.Color(0x2a0d08), k).getHex(), 0.06 + k * 0.08, 0.45 - k * 0.25);
    L.lamp.intensity = 3 - k * 2;
    const el = $("#lens"); el.hidden = false;
    el.innerHTML = `<div class="card"><h3 class="${right ? "ok" : "bad"}">${right ? "CORRECT" : "WRONG"} · ${x.patient ? "PATIENT" : "ACTOR"}</h3>
      <canvas width="360" height="80" id="lensSpark"></canvas>
      <p>It was ${describe(x)}</p>
      <p>Mean reading <b>${x.mean.toFixed(2)}</b>, peak ${x.peak.toFixed(2)}. Dashed: the actor ceiling (${D.ceiling}), the highest any unsteered text ever read.</p>
      ${x.prompt ? `<p class="pr">Prompt: “${x.prompt.replace(/[<>&]/g, "")}”</p>` : ""}
      <button class="btn go" id="lensOk">${right ? "ride up" : "back to 1"} ▸</button></div>`;
    drawSpark($("#lensSpark"), x.projs, x.projs.length, D.ceiling);
    await new Promise((r) => $("#lensOk").addEventListener("click", r, { once: true }));
    el.hidden = true;
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

  async function top(stats) {
    car.label("C", "#e0c25a"); E.atmosphere(0x000000, 0.9, 0.05); L.unit.visible = false; E.P.travel = 0; audio.ding();
    await car.open();
    const fooled = Object.entries(stats.fooled).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ×${n}`).join(", ") || "nothing";
    const el = $("#lens"); el.hidden = false;
    el.innerHTML = `<div class="card"><h3 class="ok">THE TOP</h3><p>Eight in a row. ${stats.calls} calls, ${Math.round(100 * stats.right / stats.calls)}% right. What fooled you: ${fooled}.</p>
      <p>The words were never the evidence. Every actor in exp59 stayed under ${D.ceiling} units however loudly it performed; every steered text read above 2. You were reading the part that can act.</p>
      <button class="btn go" id="lensOk">keep riding ▸</button></div>`;
    record("wrongfloor_end", { mode: "loop", calls: stats.calls, right: stats.right, fooled: stats.fooled });
    await new Promise((r) => $("#lensOk").addEventListener("click", r, { once: true }));
    el.hidden = true; await car.close(); E.atmosphere(0x3a3028, 0.06, 0.45);
  }
}
