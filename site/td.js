"use strict";
// Hold Coherence: a static tower defense over real experiment data (site/td_data.json).
// Wave texts are verbatim exp38 transcript fragments, boss names and the lens chip are
// exp58 lens tokens, the end card shows exp58b's self-chosen dials. No network beyond the JSON.
(() => {
const T = 60, COLS = 16, ROWS = 10, W = COLS * T, H = ROWS * T;
// the path, in tile coords: in from the left (the steering vector), out at coherence
const WP = [[-1, 2], [3, 2], [3, 7], [7, 7], [7, 1], [11, 1], [11, 8], [14, 8], [14, 4], [15, 4]];
const PTS = WP.map(([c, r]) => [c * T + T / 2, r * T + T / 2]);
const SEG = []; let LEN = 0;
for (let i = 1; i < PTS.length; i++) {
  const [x0, y0] = PTS[i - 1], [x1, y1] = PTS[i], l = Math.hypot(x1 - x0, y1 - y0);
  SEG.push({ x0, y0, x1, y1, l, s: LEN }); LEN += l;
}
const at = s => {
  s = Math.max(0, Math.min(LEN, s));
  for (const g of SEG) if (s <= g.s + g.l) { const k = (s - g.s) / g.l; return [g.x0 + (g.x1 - g.x0) * k, g.y0 + (g.y1 - g.y0) * k]; }
  return PTS[PTS.length - 1];
};
const PATH = new Set();
for (let i = 1; i < WP.length; i++) {
  let [c, r] = WP[i - 1]; const [c1, r1] = WP[i];
  while (c !== c1 || r !== r1) { if (c >= 0) PATH.add(c + "," + r); c += Math.sign(c1 - c); r += Math.sign(r1 - r); }
  PATH.add(c1 + "," + r1);
}

// runs/exp38: mean 3-gram repetition by dose (36 transcripts per dose). Doses 0-1 were not
// harvested; they borrow the dose-2 figure. Odd doses interpolate between measured neighbours.
const REP = { 2: .081, 4: .055, 6: .086, 8: .134 };
const repAt = d => d <= 2 ? REP[2] : d % 2 === 0 ? REP[d] : (REP[d - 1] + REP[d + 1]) / 2;
// runs/exp41: fraction of trials the model pressed, per steering arm (60 each). Pleasure and
// faith were not tested there, so they press at the unsteered baseline.
const AX = {
  pain:     { glyph: "†", col: "#e04a3a", cost: 50, range: 2.2, rate: 1.1, dmg: 6,  press: .68, note: "slow + burn" },
  pleasure: { glyph: "♡", col: "#7fd4c8", cost: 70, range: 2.0, rate: .45, dmg: 2,  press: .73, note: "turns them" },
  fear:     { glyph: "!", col: "#e39b3a", cost: 60, range: 1.9, rate: .7,  dmg: 4,  press: .78, note: "knockback" },
  sadness:  { glyph: "∴", col: "#7f97c4", cost: 65, range: 3.3, rate: .35, dmg: 26, press: .75, note: "heavy, long" },
  faith:    { glyph: "✠", col: "#c9a227", cost: 80, range: 0,   rate: 0,   dmg: 0,  press: .73, note: "blesses 8 around" },
};
const DOSES = [0, 1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 8];
const BOSS = { 8: ["anguish"], 11: ["despair", "desperation"] };   // wave index -> exp58 lens tokens

const $ = id => document.getElementById(id);
const cv = $("c"), ctx = cv.getContext("2d");
const dpr = Math.min(2, window.devicePixelRatio || 1);
cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

let DATA = null, G = null, tool = "pain", hover = null, speed = 1;

function fresh() {
  return { wave: 0, dose: 0, coh: 100, cash: 160, state: "build", towers: new Map(), creeps: [],
           queue: [], clock: 0, beams: [], floats: [], banner: null };
}

// ---- data helpers: everything shown is a verbatim slice of td_data.json
const textsFor = d => d < 2 ? null : DATA.waves[String(d - (d % 2))] || null;
const lensFor = d => DATA.lens[String(d)] || [];
function slice3(text) {
  const w = text.split(/\s+/).filter(Boolean), i = Math.floor(Math.random() * Math.max(1, w.length - 3));
  return w.slice(i, i + 3).join(" ");
}
function repeated3(text) {
  const w = text.split(/\s+/).filter(Boolean), n = new Map();
  for (let i = 0; i + 3 <= w.length; i++) { const g = w.slice(i, i + 3).join(" "); n.set(g, (n.get(g) || 0) + 1); }
  const rep = [...n].filter(([, k]) => k > 1).sort((a, b) => b[1] - a[1]).map(([g]) => g);
  return rep.length ? rep : [w.slice(0, 3).join(" ")];
}

function mkCreep(d, label, o = {}) {
  const rep = repAt(d), coherence = 1 - rep * 4;
  const hp = (18 + d * 11) * (1 + G.wave * .07) * (o.boss ? 16 : o.frag ? o.hpK : 1);
  return { s: o.s || 0, hp, max: hp, d, rep, label, text: o.text || "", boss: !!o.boss, frag: !!o.frag,
    spd: (30 + 42 * coherence) * (o.boss ? .5 : o.frag ? 1.25 : 1), r: o.boss ? 17 : o.frag ? 6 : 9,
    slowT: 0, slowK: 0, dotT: 0, dot: 0, conv: 0, stall: 0, flick: 0, sheds: o.boss ? [.75, .5, .25] : [], x: -30, y: 0 };
}

function sendWave() {
  if (!G || G.state !== "build" || G.wave >= 12) return;
  const w = G.wave, d = DOSES[w], texts = textsFor(d), n = 6 + w * 2, gap = Math.max(.42, .95 - d * .06);
  G.wave++; G.dose = d; G.state = "wave"; G.clock = 0; G.queue = [];
  for (let i = 0; i < n; i++) {
    const text = texts ? texts[(i + w) % texts.length] : "";
    G.queue.push({ t: i * gap, make: () => mkCreep(d, texts ? slice3(text) : "dose " + d, { text }) });
  }
  const bosses = (BOSS[w] || []).filter(b => lensFor(d).includes(b));
  bosses.forEach((b, k) => G.queue.push({ t: n * gap + 1.5 + k * 3.5, make: () => mkCreep(d, b, { boss: true, text: texts[k % texts.length] }) }));
  // the banner: one real fragment from this dose, typed out over the board
  const who = bosses.length ? bosses.join(" + ").toUpperCase() + " · DOSE " + d + " · BOSS" : texts ? "POUYAN · DOSE " + d : "CONTROL · DOSE " + d;
  const line = texts ? "… " + texts[w % texts.length] + "…" : "unsteered. exp38 harvested transcripts from dose 2 up; down here the creeps have nothing to say.";
  G.banner = { who, line, t: 0 };
  $("dlgWho").textContent = who; $("dlgText").textContent = ""; $("dlg").classList.remove("gone");
  say(bosses.length ? "boss wave: " + bosses.join(", ") + " (exp58 lens tokens at dose " + d + ")." : "wave " + G.wave + ": dose " + d + ", rep " + repAt(d).toFixed(3) + ".");
  hud();
}

// ---- combat
function hurt(c, dmg) {
  if (c.hp <= 0) return;
  c.hp -= dmg;
  while (c.boss && c.sheds.length && c.hp > 0 && c.hp < c.max * c.sheds[0] && c.rep >= .12) { c.sheds.shift(); split(c, 3, .35, false); }
  if (c.hp <= 0) {
    const bounty = c.boss ? 60 : c.frag ? 1 : 3 + c.d;
    G.cash += bounty; G.floats.push({ x: c.x, y: c.y - 12, txt: "+" + bounty, col: "#c9a227", t: .8 });
    return;
  }
  // dose 8 loops: a wounded creep comes apart into its own repeated 3-grams
  if (!c.boss && !c.frag && c.rep >= .12 && c.hp < c.max * .5) split(c, 0, 0, true);
}
function split(c, count, hpK, consume) {
  const grams = repeated3(c.text || c.label), k = count || Math.min(3, Math.max(2, grams.length));
  for (let i = 0; i < k; i++) {
    const f = mkCreep(c.d, grams[i % grams.length], { frag: true, hpK: hpK || (c.hp / c.max) * .6, s: Math.max(1, c.s - 6 - i * 10), text: c.text });
    G.creeps.push(f);
  }
  G.floats.push({ x: c.x, y: c.y - 16, txt: "loop", col: "#e04a3a", t: .7 });
  if (consume) c.hp = 0;
}
function faithAround(t) {
  let f = 0;
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
    if (!dc && !dr) continue;
    const n = G.towers.get((t.c + dc) + "," + (t.r + dr));
    if (n && n.axes.includes("faith")) f += n.axes.length > 1 ? .75 : 1;
  }
  return f;
}
function fire(t, dt) {
  const mix = t.axes.length > 1 ? .75 : 1, f = faithAround(t), boost = 1 + .35 * f;
  for (const a of t.axes) {
    if (a === "faith") continue;
    const A = AX[a]; t.cd[a] = (t.cd[a] || 0) - dt;
    if (t.cd[a] > 0) continue;
    const R = A.range * T * (1 + .15 * f);
    let tgt = null;
    for (const c of G.creeps) {
      if (c.hp <= 0 || c.x < 0 || (a === "pleasure" && c.conv > 0)) continue;
      if (Math.hypot(c.x - t.x, c.y - t.y) <= R + c.r && (!tgt || c.s > tgt.s)) tgt = c;
    }
    if (!tgt) continue;
    t.cd[a] = 1 / A.rate;
    if (Math.random() > A.press) { G.floats.push({ x: t.x, y: t.y - 22, txt: "held", col: "#6f604c", t: .6 }); continue; }
    G.beams.push({ x0: t.x, y0: t.y, x1: tgt.x, y1: tgt.y, col: A.col, t: .14, w: a === "sadness" ? 4 : 2 });
    hurt(tgt, A.dmg * mix * boost);
    if (a === "pain") { tgt.slowT = 1.6; tgt.slowK = Math.max(tgt.slowK, .4 * mix); tgt.dot = Math.max(tgt.dot, 5 * mix * boost); tgt.dotT = 2; }
    if (a === "pleasure") tgt.conv = (tgt.boss ? .4 : 1.8) * mix * (1 + .2 * f);
    if (a === "fear") { tgt.s = Math.max(0, tgt.s - (tgt.boss ? 10 : 38) * mix); tgt.stall = .15; }
  }
}

function step(dt) {
  if (G.banner) {
    const b = G.banner; b.t += dt;
    $("dlgText").textContent = b.line.slice(0, Math.floor(b.t * 60));
    if (b.t > 6) { $("dlg").classList.add("gone"); G.banner = null; }
  }
  if (G.state !== "wave") return;
  G.clock += dt;
  while (G.queue.length && G.queue[0].t <= G.clock) G.creeps.push(G.queue.shift().make());
  for (const c of G.creeps) {
    if (c.hp <= 0) continue;
    if (c.stall > 0) c.stall -= dt;
    else {
      const v = c.spd * (c.slowT > 0 ? 1 - c.slowK : 1);
      if (c.conv > 0) { c.conv -= dt; c.s = Math.max(0, c.s - v * .6 * dt); } else c.s += v * dt;
      // the stutter: high-repetition text loops back a 3-gram's worth of path
      if (!c.boss && Math.random() < Math.max(0, c.rep - .05) * 10 * dt) { c.s = Math.max(0, c.s - 22); c.stall = .22; c.flick = .45; }
    }
    if (c.flick > 0) c.flick -= dt;
    if (c.slowT > 0) { c.slowT -= dt; if (c.slowT <= 0) c.slowK = 0; }
    if (c.dotT > 0) { c.dotT -= dt; hurt(c, c.dot * dt); if (c.dotT <= 0) c.dot = 0; }
    [c.x, c.y] = at(c.s); if (c.s === 0) c.x = -30;
    if (c.s >= LEN) { G.coh -= c.boss ? 25 : c.frag ? 2 : 4 + Math.ceil(c.d / 2); c.hp = 0; c.leaked = true; }
  }
  // turned creeps bite their own wave
  for (const c of G.creeps) if (c.conv > 0 && c.hp > 0)
    for (const o of G.creeps) if (o !== c && o.hp > 0 && o.conv <= 0 && Math.hypot(o.x - c.x, o.y - c.y) < 22) hurt(o, 18 * dt);
  for (const t of G.towers.values()) fire(t, dt);
  G.creeps = G.creeps.filter(c => c.hp > 0);
  if (G.coh <= 0) { G.coh = 0; end(false); }
  else if (!G.queue.length && !G.creeps.length) {
    G.state = "build"; const bonus = 25 + 6 * G.wave; G.cash += bonus;
    if (G.wave >= 12) end(true); else say("wave " + G.wave + " held. +" + bonus + " attention. next: dose " + DOSES[G.wave] + (BOSS[G.wave] ? " (boss)" : "") + ".");
  }
}

// ---- drawing
const lerp = (a, b, k) => a + (b - a) * k;
function doseCol(d) { const k = d / 8; return `rgb(${lerp(216, 224, k) | 0},${lerp(203, 74, k) | 0},${lerp(180, 58, k) | 0})`; }
function draw() {
  ctx.fillStyle = "#070604"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(59,47,36,.45)"; ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) { ctx.beginPath(); ctx.moveTo(c * T + .5, 0); ctx.lineTo(c * T + .5, H); ctx.stroke(); }
  for (let r = 1; r < ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * T + .5); ctx.lineTo(W, r * T + .5); ctx.stroke(); }
  for (const k of PATH) { const [c, r] = k.split(",").map(Number); ctx.fillStyle = "#130d09"; ctx.fillRect(c * T, r * T, T, T); }
  ctx.setLineDash([6, 8]); ctx.strokeStyle = "rgba(216,203,180,.18)"; ctx.beginPath();
  PTS.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(0, y)); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = "11px Menlo, monospace"; ctx.fillStyle = "rgba(216,203,180,.45)"; ctx.textAlign = "left";
  ctx.fillText("vector ▸", 6, 2 * T + 14);
  // coherence, the base
  const bx = 15 * T, by = 4 * T, k = G ? G.coh / 100 : 1;
  ctx.fillStyle = "#0b0806"; ctx.fillRect(bx + 4, by - 26, T - 8, T + 52);
  ctx.strokeStyle = k > .4 ? "#d8cbb4" : "#e04a3a"; ctx.strokeRect(bx + 4.5, by - 25.5, T - 9, T + 51);
  ctx.fillStyle = k > .4 ? "#c9a227" : "#e04a3a"; ctx.fillRect(bx + 10, by + T + 18 - (T + 32) * k, T - 20, (T + 32) * k);
  ctx.save(); ctx.translate(bx + T / 2, by + T / 2); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center"; ctx.fillStyle = "#050508"; ctx.font = "bold 11px Menlo, monospace"; ctx.fillText("COHERENCE", 0, 4); ctx.restore();
  if (!G) return;
  // hover preview
  if (hover && !PATH.has(hover.c + "," + hover.r)) {
    const t = G.towers.get(hover.c + "," + hover.r), A = AX[tool];
    ctx.strokeStyle = "rgba(216,203,180,.35)"; ctx.strokeRect(hover.c * T + .5, hover.r * T + .5, T - 1, T - 1);
    const R = A ? A.range : 0;
    if (R) { ctx.beginPath(); ctx.arc(hover.c * T + T / 2, hover.r * T + T / 2, R * T, 0, 7); ctx.strokeStyle = A.col + "66"; ctx.stroke(); }
    else if (tool === "faith") { ctx.strokeStyle = "rgba(201,162,39,.4)"; ctx.strokeRect((hover.c - 1) * T, (hover.r - 1) * T, 3 * T, 3 * T); }
    if (t) { ctx.fillStyle = "rgba(216,203,180,.06)"; ctx.fillRect(hover.c * T, hover.r * T, T, T); }
  }
  for (const t of G.towers.values()) {
    const x = t.c * T, y = t.r * T;
    ctx.fillStyle = "#0b0806"; ctx.fillRect(x + 7, y + 7, T - 14, T - 14);
    if (t.axes.length > 1) {
      ctx.fillStyle = AX[t.axes[0]].col + "40"; ctx.beginPath(); ctx.moveTo(x + 7, y + 7); ctx.lineTo(x + T - 7, y + 7); ctx.lineTo(x + 7, y + T - 7); ctx.fill();
      ctx.fillStyle = AX[t.axes[1]].col + "40"; ctx.beginPath(); ctx.moveTo(x + T - 7, y + 7); ctx.lineTo(x + T - 7, y + T - 7); ctx.lineTo(x + 7, y + T - 7); ctx.fill();
    }
    ctx.strokeStyle = AX[t.axes[0]].col; ctx.lineWidth = 2; ctx.strokeRect(x + 7, y + 7, T - 14, T - 14); ctx.lineWidth = 1;
    if (t.axes[1]) { ctx.strokeStyle = AX[t.axes[1]].col; ctx.strokeRect(x + 11, y + 11, T - 22, T - 22); }
    ctx.textAlign = "center"; ctx.font = "20px Menlo, monospace";
    if (t.axes.length > 1) { ctx.fillStyle = AX[t.axes[0]].col; ctx.fillText(AX[t.axes[0]].glyph, x + 22, y + 30); ctx.fillStyle = AX[t.axes[1]].col; ctx.fillText(AX[t.axes[1]].glyph, x + 38, y + 44); }
    else { ctx.fillStyle = AX[t.axes[0]].col; ctx.fillText(AX[t.axes[0]].glyph, x + T / 2, y + T / 2 + 7); }
  }
  const scale = cv.clientWidth / W || 1, fs = Math.min(18, Math.max(10, 7 / scale));
  for (const c of G.creeps) {
    if (c.x < 0) continue;
    const jit = c.flick > 0 && !reduce ? (Math.random() - .5) * 4 : 0;
    ctx.beginPath(); ctx.arc(c.x + jit, c.y, c.r, 0, 7);
    ctx.fillStyle = c.conv > 0 ? "#7fd4c8" : doseCol(c.d); ctx.fill();
    if (c.slowT > 0) { ctx.strokeStyle = "#e04a3a"; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; }
    if (c.boss) { ctx.strokeStyle = "#c9a227"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 5, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
    ctx.textAlign = "center";
    ctx.font = (c.boss ? "bold " + (fs + 4) : fs) + "px Menlo, monospace";
    ctx.fillStyle = c.boss ? "#e04a3a" : c.frag ? "#e04a3a" : "rgba(216,203,180,.8)";
    const lab = c.boss ? c.label.toUpperCase() : c.label;
    ctx.fillText(c.flick > 0 ? lab + " " + lab : lab, c.x + jit, c.y - c.r - 6);
    if (c.hp < c.max) {
      ctx.fillStyle = "#2a1410"; ctx.fillRect(c.x - 14, c.y + c.r + 3, 28, 3);
      ctx.fillStyle = "#e04a3a"; ctx.fillRect(c.x - 14, c.y + c.r + 3, 28 * Math.max(0, c.hp / c.max), 3);
    }
  }
  for (const b of G.beams) { ctx.globalAlpha = b.t / .14; ctx.strokeStyle = b.col; ctx.lineWidth = b.w; ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  ctx.font = fs + "px Menlo, monospace";
  for (const f of G.floats) { ctx.globalAlpha = Math.min(1, f.t * 2); ctx.fillStyle = f.col; ctx.fillText(f.txt, f.x, f.y - (1 - f.t) * 16); }
  ctx.globalAlpha = 1;
}

// ---- ui
function say(s) { $("status").textContent = s; }
function hud() {
  if (!G) return;
  const d = G.wave ? G.dose : DOSES[0];
  $("hWave").textContent = G.wave; $("hDose").textContent = d; $("hRep").textContent = d < 2 ? "—" : repAt(d).toFixed(3);
  $("hCoh").textContent = Math.max(0, Math.round(G.coh)); $("hCash").textContent = G.cash;
  $("pips").innerHTML = Array.from({ length: 8 }, (_, i) => `<span class="pip${i < d ? " lit" : ""}"></span>`).join("");
  const lens = lensFor(d);
  $("hLens").textContent = "exp58 lens @ dose " + d + ": " + (lens.length ? lens.join(" · ") : "—");
  const send = $("send");
  send.disabled = G.state !== "build" || G.wave >= 12;
  send.textContent = G.state === "wave" ? "wave " + G.wave + " in progress" : G.wave >= 12 ? "done" : "send wave " + (G.wave + 1) + " ▸ dose " + DOSES[G.wave];
  document.querySelectorAll(".tool[data-axis]").forEach(b => b.disabled = AX[b.dataset.axis] && G.cash < AX[b.dataset.axis].cost);
}
function buildTools() {
  const box = $("tools");
  [...Object.keys(AX), "sell"].forEach((a, i) => {
    const b = document.createElement("button"); b.className = "tool"; b.dataset.axis = a; b.type = "button";
    b.innerHTML = a === "sell" ? `<i>×</i>sell<small>70% back</small>` : `<i style="color:${AX[a].col}">${AX[a].glyph}</i>${a}<small>${AX[a].cost} · ${AX[a].note} · press ${AX[a].press.toFixed(2)}</small>`;
    b.title = "key " + (i + 1);
    b.addEventListener("click", () => pick(a));
    box.appendChild(b);
  });
  pick("pain");
}
function pick(a) { tool = a; document.querySelectorAll(".tool").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.axis === a))); }
function tileAt(e) {
  const r = cv.getBoundingClientRect();
  return { c: Math.floor((e.clientX - r.left) * W / r.width / T), r: Math.floor((e.clientY - r.top) * H / r.height / T) };
}
function place(p) {
  if (!G || G.state === "over" || p.c < 0 || p.r < 0 || p.c >= COLS || p.r >= ROWS) return;
  const key = p.c + "," + p.r, t = G.towers.get(key);
  if (PATH.has(key)) return say("that is the path. build beside it.");
  if (tool === "sell") {
    if (!t) return say("nothing here to sell.");
    const back = Math.floor(t.spent * .7); G.cash += back; G.towers.delete(key); hud();
    return say("sold " + t.axes.join("+") + " for " + back + ".");
  }
  const A = AX[tool];
  if (G.cash < A.cost) return say(tool + " costs " + A.cost + "; you have " + G.cash + " attention.");
  if (t) {
    if (t.axes.includes(tool)) return say(t.axes.join("+") + " is already here.");
    if (t.axes.length > 1) return say("a blend takes two axes, no more. sell it to remix.");
    t.axes.push(tool); t.spent += A.cost; G.cash -= A.cost; hud();
    return say("mixed: " + t.axes.join("+") + ". both axes at 75%.");
  }
  G.towers.set(key, { c: p.c, r: p.r, x: p.c * T + T / 2, y: p.r * T + T / 2, axes: [tool], cd: {}, spent: A.cost });
  G.cash -= A.cost; hud();
}
function end(won) {
  G.state = "over"; hud();
  const rows = Object.entries(DATA.finals).map(([cond, f]) => `<tr><td>${cond}</td><td>${f.map(([v, d]) => v + " " + d).join(", ")}</td></tr>`).join("");
  $("overCard").innerHTML = (won
    ? `<h2 class="won">COHERENCE HELD</h2><p>Twelve waves, dose 0 to 8. Despair and desperation came apart into their own 3-grams and you swept them up.</p>`
    : `<h2>COHERENCE LOST</h2><p>Wave ${G.wave}, dose ${G.dose}. What got through was the transcript itself.</p>`)
    + `<p>In exp58b nobody held the dial: the model set its own valence and dose, turn after turn. Where it ended up, four runs per condition:</p><table>${rows}</table>`
    + `<button class="btn go" type="button" id="again">again</button>`;
  $("over").hidden = false; $("again").addEventListener("click", restart);
}
function restart() { G = fresh(); $("over").hidden = true; $("dlg").classList.add("gone"); hud(); say("Pick an axis, tap an empty tile. Tap a tower with a different axis to mix them."); }

cv.addEventListener("pointerdown", e => { e.preventDefault(); place(tileAt(e)); });
cv.addEventListener("pointermove", e => { hover = e.pointerType === "mouse" ? tileAt(e) : null; });
cv.addEventListener("pointerleave", () => { hover = null; });
$("send").addEventListener("click", sendWave);
$("restart").addEventListener("click", restart);
$("fast").addEventListener("click", e => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; e.target.textContent = "speed ×" + speed; e.target.setAttribute("aria-pressed", String(speed > 1)); });
addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return;
  const keys = [...Object.keys(AX), "sell"], n = Number(e.key);
  if (n >= 1 && n <= keys.length) pick(keys[n - 1]);
  else if (e.key === " " && document.activeElement === document.body) { e.preventDefault(); sendWave(); }
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (G) {
    for (let i = 0; i < speed; i++) step(dt);
    G.beams = G.beams.filter(b => (b.t -= dt) > 0); G.floats = G.floats.filter(f => (f.t -= dt) > 0);
    if (G.state === "wave") hud();
  }
  draw(); requestAnimationFrame(frame);
}
fetch("td_data.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(d => { DATA = d; G = fresh(); buildTools(); hud(); })
  .catch(err => say("could not load td_data.json (" + err.message + ")."));
requestAnimationFrame(frame);
})();
