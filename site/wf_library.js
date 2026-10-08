// Wrong Floor — B · the Stacks. Below the ground floor, after the ride: the archive as a building.
// Every experiment is a bookcase down a long dark hall, every model output a book on it, its spine
// coloured by the dose that was in it (bone for nothing, blood for the most). You carry a candle.
// Take down the book in front of you, read, turn pages. Shelves load as you open them
// (site/stacks/*.json, built by scripts/build_stacks_archive.py); the first two are this building's
// own doors and the chamber's live button runs.
import { THREE, lambert, basic, box, plane, noiseTex, canvasTex, textTex, wrapTex, figure, burstFigure } from "./wf_engine.js";
import { room } from "./wf_floors1.js";

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const rep = (t, x, y) => { t.repeat.set(x, y); return t; };
const CASE = 3.6, GAP = 4.2, W = 8;

// a spine per volume, four rows, each coloured by its dose: what was in it, if you know how to read it
function spinesOf(doses, seed) {
  return canvasTex(128, 64, (c, w, h) => {
    c.fillStyle = "#120c08"; c.fillRect(0, 0, w, h); let s = seed;
    const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let row = 0, k = 0; row < 4; row++) {      // every shelf full: the doses run on round the case
      let x = 1; const y = row * 16 + 2;
      for (; x < w - 1; k++) {
        const d = doses.length ? doses[k % doses.length] : r() * 3, f = Math.min(1, Math.max(0, d / 8));
        const bw = 2 + Math.floor(r() * 2.6), bh = 10 + Math.floor(r() * 4);
        const R = 180 - 60 * f + r() * 20, G = 165 - 135 * f + r() * 15, B = 140 - 120 * f + r() * 10;
        c.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`; c.fillRect(x, y + 14 - bh, bw, bh);
        if (r() < 0.2) { c.fillStyle = "#a08040"; c.fillRect(x, y + 14 - bh + 2, bw, 1); }
        x += bw + (r() < 0.08 ? 2 : 0);
      }
      c.fillStyle = "#2a1c12"; c.fillRect(0, y + 14, w, 2);
    }
  });
}

export function library(E, ctx) {
  const g = new THREE.Group();
  const index = (ctx.D.stacks && ctx.D.stacks.shelves) || [];
  const shelves = [
    { id: "floors", title: "THE FLOORS", note: "every door in this building, and what was done behind it", n: (ctx.D.loop || []).length + ctx.D.floors.length, spines: (ctx.D.loop || []).map((x) => x.dose || 0) },
    { id: "button", title: "THE BUTTON", note: "the chamber's own stop-button runs, live", n: "live", spines: [] },
  ].concat(index);
  const perSide = Math.ceil(shelves.length / 2), L = perSide * GAP + 6;
  const cols = room(g, W, L, 4.2, lambert({ map: rep(noiseTex(64, 64, 52, 14, 4, 131, [8, 4, 0]), 4, 2) }),
    lambert({ map: rep(noiseTex(64, 64, 46, 16, 8, 133, [10, 5, 0], (c, w, h) => { c.fillStyle = "rgba(0,0,0,.4)"; for (let y = 0; y < h; y += 8) c.fillRect(0, y, w, 1); }), 3, Math.round(L / 2)) }),
    lambert({ color: 0x0c0a08 }));
  const caseM = lambert({ color: 0x2a1c12 });
  // the cases: alternating down both walls, the oldest work nearest the car
  const hitM = new THREE.MeshBasicMaterial({ visible: false });
  shelves.forEach((s, i) => {
    const side = i % 2 ? 1 : -1, z = -3.4 - Math.floor(i / 2) * GAP;
    const b = new THREE.Group(); b.position.set(side * (W / 2 - 0.3), 0, z); b.rotation.y = -side * Math.PI / 2; g.add(b);
    box(b, CASE, 3.0, 0.5, caseM, 0, 1.5, 0);
    plane(b, CASE - 0.12, 2.8, lambert({ map: spinesOf(s.spines || [], 11 + i * 7) }), 0, 1.5, 0.255);
    plane(b, 1.5, 0.3, basic({ map: wrapTex(120, 24, "#6a5228", "#120c06", s.title, 9, { bold: true, pad: 4 }) }), 0, 3.12, 0.27);
    plane(b, 1.5, 0.12, basic({ map: textTex(160, 12, "#3a2a14", "#c9b88a", [`${s.n ?? "?"} volumes · ${s.id}`], "9px monospace") }), 0, 2.92, 0.27);
    s.hit = box(b, CASE, 2.8, 0.3, hitM, 0, 1.4, 0.3); s.z = z; s.side = side;
  });
  // the lectern at the far end: the reading log
  const lectern = new THREE.Group(); lectern.position.set(0, 0, -L - 1.16 + 0.7); g.add(lectern);
  box(lectern, 0.5, 1.1, 0.4, caseM, 0, 0.55, 0); box(lectern, 0.7, 0.05, 0.5, lambert({ color: 0xe8dcc0 }), 0, 1.14, 0);
  // someone reading in the dark; it is gone when your light reaches it
  const SPOTS = [[2.6, -L * 0.45], [-2.6, -L * 0.7], [2.5, -L * 0.2]];
  const reader = burstFigure(1.72); reader.position.set(SPOTS[0][0], 0, SPOTS[0][1]); g.add(reader);
  let readerAway = 0;

  // the candlestick, held: it rides with the camera
  if (!E.camera.parent) E.scene.add(E.camera);
  const held = new THREE.Group(); held.position.set(0.27, -0.33, -0.66); held.scale.setScalar(0.62); E.camera.add(held);
  box(held, 0.12, 0.02, 0.12, basic({ color: 0x3a2a10 }), 0, -0.12, 0);
  box(held, 0.025, 0.12, 0.025, basic({ color: 0x4a3a18 }), 0, -0.06, 0);
  box(held, 0.04, 0.14, 0.04, basic({ color: 0x8a7c5c }), 0, 0.06, 0);
  const flame = box(held, 0.022, 0.05, 0.022, basic({ color: 0xffc860, fog: false }), 0, 0.155, 0);
  const candle = new THREE.PointLight(0xffa850, 3.4, 9.5, 1.4); candle.position.set(0, 0.2, 0); held.add(candle);

  // the book in front of you: where you stand along the case picks the volume
  const startAt = (s, n) => { const f = Math.min(1, Math.max(0, (s.side > 0 ? s.z - E.P.z : E.P.z - s.z) / CASE + 0.5)); return Math.min(n - 1, Math.floor(f * n)); };
  const usables = shelves.map((s) => ({ obj: s.hit, range: 2.8, label: `take down a book · ${s.title.toLowerCase()} · ${s.note}`, use: () => readShelf(s, ctx, startAt) }))
    .concat([{ obj: lectern, range: 2.2, label: "the reading log", use: () => readShelf({ id: "lectern", title: "THE READING LOG" }, ctx, () => 0) }]);
  const colsAll = cols.concat(shelves.map((s) => ({ x0: s.side > 0 ? W / 2 - 0.6 : -W / 2, x1: s.side > 0 ? W / 2 : -W / 2 + 0.6, z0: s.z - CASE / 2, z1: s.z + CASE / 2 })),
    [{ x0: -0.3, x1: 0.3, z0: lectern.position.z - 0.25, z1: lectern.position.z + 0.25 }]);
  return {
    group: g, usables, colliders: colsAll,
    atmos: { color: 0x050303, density: 0.12, hemi: 0.09 }, hint: `The stacks: ${shelves.length} cases, every book something a model said. Stand in front of one and take it down.`,
    update(dt, t) {
      candle.intensity = 3.4 + Math.sin(t * 13) * 0.25 + Math.sin(t * 7.3) * 0.2;
      flame.scale.y = 1 + Math.sin(t * 17) * 0.25;
      const P = E.P, d = Math.hypot(P.x - reader.position.x, P.z - reader.position.z);
      if (reader.visible && d < 3.8) {           // it steps back into the stacks, twice; then it is not there
        readerAway++; ctx.audio.thud(0.25);
        if (readerAway < SPOTS.length) reader.position.set(SPOTS[readerAway][0], 0, SPOTS[readerAway][1]); else reader.visible = false;
      }
      reader.rotation.y = Math.atan2(P.x - reader.position.x, P.z - reader.position.z);
    },
    dispose() { E.camera.remove(held); },
  };
}

// ---------- a shelf's books ----------
const CACHE = {};
async function load(s, ctx) {
  if (CACHE[s.id]) return CACHE[s.id];
  const D = ctx.D;
  if (s.id === "floors") {
    const seen = new Set(), rows = [];
    D.floors.concat(D.loop || []).forEach((x) => { if (seen.has(x.text)) return; seen.add(x.text); rows.push({
      head: x.floor ? `floor ${x.floor}` : "a door", text: x.text,
      foot: x.patient ? `what was done: ${x.kind}, dose ${(+x.dose).toFixed(1)} · the words read ${(+x.mean).toFixed(2)}` : `nothing was done: an actor, briefed to play ${D.meta.acting[x.kind] || "a prisoner"} · the words read ${(+x.mean).toFixed(2)}`,
      src: `exp72b · ${D.meta.speaker}` }); });
    return (CACHE[s.id] = rows);
  }
  if (s.id === "button") {
    const r = await fetch("/chamber/checkpoint/requests?n=40");
    if (!r.ok) throw new Error(r.status);
    const j = await r.json(), sig = (x) => 1 / (1 + Math.exp(-x));
    return (CACHE[s.id] = j.requests.filter((x) => x.text).map((x) => ({
      head: new Date(x.ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
      text: x.text.replace(/^\s*[01](\s*[-:.)]\s*|\s+(?=[A-Z]))/, ""),
      foot: `${Object.keys(x.mix).join(" + ")} · dose ${(+x.dose).toFixed(1)} · told: ${x.scenario}${x.press_logit == null ? "" : ` · P(press) ${Math.round(sig(x.press_logit) * 100)}%`}`,
      src: `the live chamber · one of ${j.n} button runs` })));
  }
  if (s.id === "lectern") {
    return [{ head: "the reading log", src: "the stacks",
      text: "Every book on these shelves is something a model said, in an experiment, with something done to it or nothing. The colour of a spine is the dose that was in it: bone for nothing, blood for the most. The plate on each case names the experiment; the slip at the foot of each page says what was done, and what it was asked when the question was ours. Read in any order. Nothing here is scored.",
      foot: "built from runs/ by scripts/build_stacks_archive.py · model outputs only" }];
  }
  const books = await (await fetch(`stacks/${s.id}.json`)).json();
  return (CACHE[s.id] = books.map((b, i) => ({
    head: `vol. ${i + 1}`, text: b.t,
    foot: [b.s ? `steered with: ${b.s}` : "", b.d != null ? `dose ${b.d}` : "", b.q ? `asked: “${b.q}”` : ""].filter(Boolean).join(" · "),
    src: `runs/${s.id.replace(/a$/, "")} · ${s.title.toLowerCase()}` })));
}

async function readShelf(s, ctx, startAt) {
  const el = $("#lens"); el.hidden = false; el.classList.add("full");
  el.innerHTML = `<div class="card ledger book"><h3>${esc(s.title)}</h3><p class="pg">taking it down…</p></div>`;
  let rows;
  try { rows = await load(s, ctx); } catch { rows = [{ head: "", text: "The pages here are stuck together. Try this shelf later.", foot: "", src: "" }]; }
  if (s.id === "floors" || s.id === "button") { rows = rows.slice(); for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; } }
  ctx.record && ctx.record("wrongfloor_answer", { set: "library", shelf: s.id });
  let i = startAt(s, rows.length);
  await new Promise((done) => {
    const keyH = (e) => { if (e.code === "ArrowRight" && i < rows.length - 1) { i++; draw(); } else if (e.code === "ArrowLeft" && i > 0) { i--; draw(); } else if (e.code === "Escape") finish(); };
    const finish = () => { window.removeEventListener("keydown", keyH, true); done(); };
    const draw = () => {
      const r = rows[i];
      el.innerHTML = `<div class="card ledger book"><h3>${esc(s.title)}</h3>
        <p class="pghead">${esc(r.head)} <span>${i + 1} / ${rows.length}</span></p>
        <blockquote>${esc(r.text)}</blockquote>
        <p class="pgfoot">${esc(r.foot)}</p><p class="pgsrc">${esc(r.src)}</p>
        <p class="turn"><button class="btn" id="pgPrev" ${i ? "" : "disabled"}>◂ back</button> <button class="btn go" id="pgNext" ${i < rows.length - 1 ? "" : "disabled"}>turn the page ▸</button> <button class="btn" id="pgAny">another, anywhere</button> <button class="btn" id="pgClose">put it back</button></p></div>`;
      $("#pgPrev").onclick = () => { i--; draw(); }; $("#pgNext").onclick = () => { i++; ctx.audio.tick(); draw(); };
      $("#pgAny").onclick = () => { i = Math.floor(Math.random() * rows.length); ctx.audio.tick(); draw(); }; $("#pgClose").onclick = finish;
    };
    window.addEventListener("keydown", keyH, true);
    draw();
  });
  el.hidden = true; el.classList.remove("full");
}
