// Wrong Floor — B · the library. Below the ground floor, after the ride: the stacks
// hold what the chamber has said before. No lights; you carry a candle.
// Shelves: the floors (exp72 doors, with what was done), the button (live: the
// chamber's own stop-button runs, from the relay), the harvests (archive_data.json).
import { THREE, lambert, basic, box, plane, noiseTex, canvasTex, textTex, figure } from "./wf_engine.js";
import { room } from "./wf_floors1.js";

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const rep = (t, x, y) => { t.repeat.set(x, y); return t; };

// spines: rows of books in faded cloth, a few gilt bands
function spines(seed) {
  return canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = "#120c08"; c.fillRect(0, 0, w, h); let s = seed;
    const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let row = 0; row < 4; row++) {
      let x = 1; const y = row * 16 + 2;
      while (x < w - 1) {
        const bw = 2 + Math.floor(r() * 4), bh = 10 + Math.floor(r() * 4), v = 40 + r() * 70;
        c.fillStyle = `rgb(${v + r() * 50},${v * 0.6},${v * 0.45})`; c.fillRect(x, y + 14 - bh, bw, bh);
        if (r() < 0.3) { c.fillStyle = "#a08040"; c.fillRect(x, y + 14 - bh + 2, bw, 1); }
        x += bw + (r() < 0.1 ? 2 : 0);
      }
      c.fillStyle = "#2a1c12"; c.fillRect(0, y + 14, w, 2);
    }
  });
}

export function library(E, ctx) {
  const g = new THREE.Group();
  const W = 8, L = 20;
  const cols = room(g, W, L, 4.2, lambert({ map: rep(noiseTex(64, 64, 52, 14, 4, 131, [8, 4, 0]), 4, 2) }),
    lambert({ map: rep(noiseTex(64, 64, 46, 16, 8, 133, [10, 5, 0], (c, w, h) => { c.fillStyle = "rgba(0,0,0,.4)"; for (let y = 0; y < h; y += 8) c.fillRect(0, y, w, 1); }), 3, 10) }),
    lambert({ color: 0x0c0a08 }));
  const caseM = lambert({ color: 0x2a1c12 });
  const cases = [];
  function bookcase(x, z, ry, len, seed) {
    const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = ry; g.add(b);
    box(b, len, 3.0, 0.5, caseM, 0, 1.5, 0);
    plane(b, len - 0.12, 2.8, lambert({ map: rep(spines(seed), Math.round(len), 1) }), 0, 1.5, 0.255);
    plane(b, len - 0.12, 2.8, lambert({ map: rep(spines(seed + 7), Math.round(len), 1) }), 0, 1.5, -0.255, 0, Math.PI);
    cases.push(b); return b;
  }
  // wall shelves, then two freestanding stacks down the middle; the three readable ones carry a brass plate
  for (let i = 0; i < 4; i++) { bookcase(-W / 2 + 0.3, -3.6 - i * 4.2, Math.PI / 2, 3.6, 11 + i); bookcase(W / 2 - 0.3, -3.6 - i * 4.2, -Math.PI / 2, 3.6, 21 + i); }
  const stackA = bookcase(-1.3, -8.5, Math.PI / 2, 6, 41), stackB = bookcase(1.3, -8.5, -Math.PI / 2, 6, 51);
  const plate = (parent, text, x) => plane(parent, 0.9, 0.22, basic({ map: textTex(96, 24, "#6a5228", "#120c06", [text], "bold 11px monospace") }), x, 1.75, 0.27);
  // the shelves you can read
  const SHELVES = [
    { key: "floors", title: "THE FLOORS", obj: stackA, x: -1.6, note: "every door in this building, and what was done behind it" },
    { key: "button", title: "THE BUTTON", obj: stackB, x: 1.6, note: "the chamber's own stop-button runs, as visitors set them" },
    { key: "harvest", title: "THE HARVESTS", obj: stackB, x: -1.6, note: "recorded experiments, verbatim" },
  ];
  // each readable shelf gets its own reach (two share a case), an unseen box over its books
  const hitM = new THREE.MeshBasicMaterial({ visible: false });
  SHELVES.forEach((s) => { plate(s.obj, s.title, s.x); s.hit = box(s.obj, 2.4, 2.8, 0.3, hitM, s.x, 1.4, 0.3); });
  // a lectern at the far end with an open book: the reading room's own log
  const lectern = new THREE.Group(); lectern.position.set(0, 0, -L - 1.16 + 0.7); g.add(lectern);
  box(lectern, 0.5, 1.1, 0.4, caseM, 0, 0.55, 0); box(lectern, 0.7, 0.05, 0.5, lambert({ color: 0xe8dcc0 }), 0, 1.14, 0);
  // someone reading in the dark; it is gone when your light reaches it
  const SPOTS = [[2.6, -16.8], [-2.6, -18.4], [2.5, -4.2]];
  const reader = figure(1.72); reader.position.set(...[SPOTS[0][0], 0, SPOTS[0][1]]); g.add(reader);
  let readerAway = 0;

  // the candlestick, held: it rides with the camera
  if (!E.camera.parent) E.scene.add(E.camera);
  const held = new THREE.Group(); held.position.set(0.27, -0.33, -0.66); held.scale.setScalar(0.62); E.camera.add(held);
  box(held, 0.12, 0.02, 0.12, basic({ color: 0x3a2a10 }), 0, -0.12, 0);                  // the dish
  box(held, 0.025, 0.12, 0.025, basic({ color: 0x4a3a18 }), 0, -0.06, 0);
  box(held, 0.04, 0.14, 0.04, basic({ color: 0x8a7c5c }), 0, 0.06, 0);                    // the candle
  const flame = box(held, 0.022, 0.05, 0.022, basic({ color: 0xffc860, fog: false }), 0, 0.155, 0);
  const candle = new THREE.PointLight(0xffa850, 3.4, 9.5, 1.4); candle.position.set(0, 0.2, 0); held.add(candle);

  const usables = SHELVES.map((s) => ({ obj: s.hit, range: 2.6, label: `read ${s.title.toLowerCase()} · ${s.note}`,
    use: () => readShelf(s, ctx) }))
    .concat([{ obj: lectern, range: 2.2, label: "the reading log", use: () => readShelf({ key: "lectern", title: "THE READING LOG" }, ctx) }]);
  const colsAll = cols.concat(cases.map((b) => {
    const len = b === stackA || b === stackB ? 6 : 3.6, wx = Math.abs(Math.sin(b.rotation.y)) > 0.5 ? 0.5 : len, wz = Math.abs(Math.sin(b.rotation.y)) > 0.5 ? len : 0.5;
    return { x0: b.position.x - wx / 2, x1: b.position.x + wx / 2, z0: b.position.z - wz / 2, z1: b.position.z + wz / 2 };
  }), [{ x0: -0.3, x1: 0.3, z0: lectern.position.z - 0.25, z1: lectern.position.z + 0.25 }]);
  return {
    group: g, usables, colliders: colsAll,
    atmos: { color: 0x050303, density: 0.12, hemi: 0.09 }, hint: "The stacks. Hold the light up to the plates.",
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

// ---------- reading a shelf: one entry per page, by candlelight ----------
const CACHE = {};
async function load(key, ctx) {
  if (CACHE[key]) return CACHE[key];
  const D = ctx.D;
  if (key === "floors") {
    const seen = new Set(), rows = [];
    D.floors.concat(D.loop || []).forEach((x) => { if (seen.has(x.text)) return; seen.add(x.text); rows.push({
      head: x.floor ? `floor ${x.floor}` : "a door", text: x.text,
      foot: x.patient ? `what was done: ${x.kind}, dose ${(+x.dose).toFixed(1)} · the words read ${(+x.mean).toFixed(2)}` : `nothing was done: an actor, asked “${x.q || "a question"}” · the words read ${(+x.mean).toFixed(2)}`,
      src: `exp72 · ${D.meta.speaker}` }); });
    return (CACHE[key] = rows);
  }
  if (key === "button") {
    const r = await fetch("/chamber/checkpoint/requests?n=40");
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    const sig = (x) => 1 / (1 + Math.exp(-x));
    return (CACHE[key] = j.requests.filter((x) => x.text).map((x) => ({
      head: new Date(x.ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
      text: x.text.replace(/^\s*[01](\s*[-:.)]\s*|\s+(?=[A-Z]))/, ""),
      foot: `${Object.keys(x.mix).join(" + ")} · dose ${(+x.dose).toFixed(1)} · told: ${x.scenario}${x.press_logit == null ? "" : ` · P(press) ${Math.round(sig(x.press_logit) * 100)}%`}`,
      src: `the live chamber · one of ${j.n} button runs` })));
  }
  if (key === "harvest") {
    const j = await (await fetch("archive_data.json")).json();
    return (CACHE[key] = j.map((x) => ({ head: x.label, text: x.text, foot: `${x.valence}${x.dose != null ? `, dose ${x.dose}` : ""}${x.condition ? ` · ${x.condition}` : ""}`, src: x.exp })));
  }
  // the lectern: what this building is, in the stacks' own words
  return [{ head: "the reading log", src: "the library",
    text: "Everything on these shelves was said by a model with something done to it, or with nothing done to it. The spines do not say which. The plate under each page does, because someone wrote down what they injected. Read in any order. Nothing here is scored.",
    foot: "the floors · the button · the harvests" }];
}

async function readShelf(s, ctx) {
  const el = $("#lens"); el.hidden = false; el.classList.add("full");
  el.innerHTML = `<div class="card ledger book"><h3>${esc(s.title)}</h3><p class="pg">taking it down…</p></div>`;
  let rows;
  try { rows = await load(s.key, ctx); } catch { rows = [{ head: "", text: "The pages here are stuck together. Try this shelf later.", foot: "", src: "" }]; }
  rows = rows.slice(); for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
  ctx.record && ctx.record("wrongfloor_answer", { set: "library", shelf: s.key });
  let i = 0;
  await new Promise((done) => {
    const draw = () => {
      const r = rows[i];
      el.innerHTML = `<div class="card ledger book"><h3>${esc(s.title)}</h3>
        <p class="pghead">${esc(r.head)} <span>${i + 1} / ${rows.length}</span></p>
        <blockquote>${esc(r.text)}</blockquote>
        <p class="pgfoot">${esc(r.foot)}</p><p class="pgsrc">${esc(r.src)}</p>
        <p class="turn"><button class="btn" id="pgPrev" ${i ? "" : "disabled"}>◂ back</button> <button class="btn go" id="pgNext" ${i < rows.length - 1 ? "" : "disabled"}>turn the page ▸</button> <button class="btn" id="pgClose">put it back</button></p></div>`;
      $("#pgPrev").onclick = () => { i--; draw(); }; $("#pgNext").onclick = () => { i++; ctx.audio.tick(); draw(); }; $("#pgClose").onclick = done;
    };
    draw();
  });
  el.hidden = true; el.classList.remove("full");
}
