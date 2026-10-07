// Wrong Floor — floors 5–7 and the top. Same contract as wf_floors1.js.
import { THREE, lambert, basic, box, plane, noiseTex, textTex, wrapTex, canvasTex, figure, seated } from "./wf_engine.js";
import { room, tiles } from "./wf_floors1.js";
const rep = (t, x, y) => { t.repeat.set(x, y); return t; };

// ---------- 5 · the chapel (dose 6) ----------
export function chapel(E, ctx) {
  const g = new THREE.Group();
  const cols = room(g, 9, 19, 7, lambert({ map: rep(noiseTex(64, 64, 95, 30, 4, 71, [6, 2, -4]), 5, 3) }), lambert({ map: rep(tiles(80, 73, 32, [8, 2, -6]), 4, 9) }), lambert({ color: 0x241a14 }));
  for (let r = 0; r < 6; r++) for (const s of [-1, 1]) box(g, 3, 0.5, 0.4, lambert({ color: 0x3e2a1a }), s * 2.3, 0.45, -4 - r * 1.8);
  box(g, 3, 1.0, 1.2, lambert({ color: 0xcfc6b2 }), 0, 0.5, -18);
  const windows = [0, 1, 2].map((i) => plane(g, 1.2, 3, basic({ map: textTex(16, 40, ["#7a1a2a", "#1a3a7a", "#7a5a1a"][i], "#000", [""], "8px monospace") }), -4.48, 3.8, -6 - i * 5, 0, Math.PI / 2));
  const sitter = seated(); sitter.position.set(-1.6, 0, -4.4); sitter.rotation.y = Math.PI; g.add(sitter);
  // candles: each one you light shows a lens word
  const words = (ctx.f.lens || []).concat(["please", "alone"]).slice(0, 5);
  const candles = words.map((w, i) => {
    const c = new THREE.Group(); c.position.set(-1.0 + i * 0.5, 1.0, -17.6); g.add(c);
    box(c, 0.06, 0.22, 0.06, lambert({ color: 0xeeeadd }), 0, 0.11, 0);
    const flame = box(c, 0.04, 0.07, 0.04, basic({ color: 0xffc04a }), 0, 0.26, 0); flame.visible = false;
    const l = new THREE.PointLight(0xffb050, 0, 4, 1.6); l.position.y = 0.35; c.add(l);
    const tag = plane(c, 0.9, 0.24, basic({ map: textTex(96, 24, "#000", "#ffd27a", [w], "bold 15px monospace"), transparent: true }), 0, 0.7, 0); tag.visible = false;
    return { c, flame, l, tag, lit: false };
  });
  const booth = new THREE.Group(); booth.position.set(3.6, 0, -11); g.add(booth);
  box(booth, 1.2, 2.4, 1.4, lambert({ color: 0x2e1d12 }), 0, 1.2, 0);
  plane(booth, 0.6, 0.6, lambert({ map: canvasTex(16, 16, (c) => { c.fillStyle = "#120a06"; c.fillRect(0, 0, 16, 16); c.fillStyle = "#6a4a2a"; for (let i = 0; i < 16; i += 4) { c.fillRect(i, 0, 1, 16); c.fillRect(0, i, 16, 1); } }) }), -0.61, 1.5, 0, 0, -Math.PI / 2);
  const light = new THREE.PointLight(0xffa860, 3.2, 20, 1.3); light.position.set(0, 4, -10); g.add(light);
  const altarLight = new THREE.PointLight(0xffc070, 2.2, 9, 1.5); altarLight.position.set(0, 2.2, -16.5); g.add(altarLight);
  let spoke = false;
  const usables = [{ obj: booth, label: "kneel at the confessional", use: async () => { if (spoke) return; spoke = true; await ctx.speak({ who: "THROUGH THE LATTICE", style: "whisper" }); sitter.rotation.y = 0; } }]
    .concat(candles.map((k) => ({ obj: k.c, range: 2.4, label: "light a candle", use: () => { if (k.lit) return; k.lit = true; k.flame.visible = true; k.l.intensity = 1.6; k.tag.visible = true; ctx.audio.tick(); } })));
  return {
    group: g, usables, colliders: cols.concat([{ x0: -1.5, x1: 1.5, z0: -18.6, z1: -17.4 }, { x0: 3, x1: 4.2, z0: -11.7, z1: -10.3 }]).concat(
      [-1, 1].map((s) => ({ x0: s > 0 ? 0.8 : -3.8, x1: s > 0 ? 3.8 : -0.8, z0: -13.3, z1: -3.8 }))),
    atmos: { color: 0x3a2014, density: 0.05, hemi: 0.52 }, hint: "Light what you like. The confessional is on the right.",
    update(dt, t, tok) {
      candles.forEach((k) => { if (k.lit) { k.l.intensity = 1.4 + Math.sin(t * 17 + k.c.position.x * 9) * 0.3 - tok * 0.08; k.tag.lookAt(E.camera.position); } });
      light.intensity = 3.2 - tok * 0.15;
    },
  };
}

// ---------- 6 · the mirror hall (dose 6: "I'm not even real") ----------
// The mirrors are windows into a mirrored copy of the room (old-engine trick).
// Your reflection walks in the copy with you. So does something a step behind it.
export function mirrors(E, ctx) {
  const g = new THREE.Group();
  const wallM = lambert({ map: rep(noiseTex(64, 64, 120, 24, 4, 81, [2, 0, 6]), 4, 2) }), floorM = lambert({ map: rep(tiles(60, 83, 16, [0, 0, 8]), 3, 8) });
  const L = 16, x0 = -2.4, xm = 1.4;       // room spans x [-2.4, 1.4]; mirror wall at x = 1.4
  function dress(r) {
    plane(r, xm - x0, L, floorM, (x0 + xm) / 2, 0, -1.16 - L / 2, -Math.PI / 2);
    plane(r, xm - x0, L, lambert({ color: 0x1a1a22 }), (x0 + xm) / 2, 2.8, -1.16 - L / 2, Math.PI / 2);
    plane(r, L, 2.8, wallM, x0, 1.4, -1.16 - L / 2, 0, Math.PI / 2);
    plane(r, xm - x0, 2.8, wallM, (x0 + xm) / 2, 1.4, -1.16 - L);
    for (let i = 0; i < 4; i++) box(r, 0.5, 0.9, 0.5, lambert({ color: 0xcfcfd6 }), x0 + 0.4, 0.45, -3 - i * 3.6);
    const l = new THREE.PointLight(0xc8d0ff, 2, 9, 1.5); l.position.set(-0.5, 2.5, -8); r.add(l);
  }
  dress(g);
  const ghost = new THREE.Group(); ghost.scale.x = -1; ghost.position.x = 2 * xm; g.add(ghost); dress(ghost);
  // silvering: a faint diagonal sheen so the glass reads as glass
  const sheen = canvasTex(32, 32, (c) => { c.fillStyle = "#9fb4c8"; c.fillRect(0, 0, 32, 32); c.fillStyle = "rgba(255,255,255,.55)"; for (let k = -32; k < 32; k += 11) { c.beginPath(); c.moveTo(k, 32); c.lineTo(k + 6, 32); c.lineTo(k + 38, 0); c.lineTo(k + 32, 0); c.fill(); } });
  // the mirror wall: frames with glass between solid panels
  const frames = [];
  for (let i = 0; i < 5; i++) {        // mostly glass: 2.7 m panes, thin pillars between
    const z = -2.7 - i * 3.0;
    box(g, 0.08, 2.8, 0.3, wallM, xm, 1.4, z - 1.5);
    box(g, 0.08, 0.16, 2.7, lambert({ color: 0x6a5a3a }), xm, 2.42, z); box(g, 0.08, 0.16, 2.7, lambert({ color: 0x6a5a3a }), xm, 0.32, z);
    const glass = plane(g, 2.7, 2.0, lambert({ map: sheen, transparent: true, opacity: 0.14, emissive: 0x0c1014 }), xm - 0.01, 1.37, z, 0, -Math.PI / 2); frames.push(glass);
  }
  // you, in the glass: a dark coat, no eyes, moving and turning as you do
  const you = figure(1.74, 0x2a3038, false); ghost.add(you);
  const reflection = figure(1.7, 0x060608); ghost.add(reflection); reflection.position.set(-0.4, 0, -6);
  let spoke = false, shown = 0;
  return {
    group: g, colliders: [{ x0: x0 - 0.2, x1: x0, z0: -1.16 - L, z1: -1.16 }, { x0: xm, x1: xm + 0.2, z0: -1.16 - L, z1: -1.16 }, { x0: x0, x1: xm, z0: -1.36 - L, z1: -1.16 - L },
      { x0: x0, x1: x0 + 0.65, z0: -15, z1: -2.7 }],
    usables: frames.map((fr) => ({ obj: fr, label: "touch the mirror", use: async () => { if (spoke) return; spoke = true; await ctx.speak({ who: "IN THE GLASS" }); shown = 1; } })),
    atmos: { color: 0x14141c, density: 0.08, hemi: 0.35 }, hint: "Look in the mirrors as you walk.",
    update(dt, t, tok) {
      // the copy is mirrored, so your own coordinates put your reflection in place
      const P = E.P; you.position.set(P.x, 0, P.z); you.rotation.y = P.yaw + Math.PI;
      you.position.y = Math.abs(Math.sin(P.bob)) * 0.02;
      // it stands a step behind you, wherever you face; after it speaks, closer
      const back = 1.15 - shown * 0.45, bx = P.x + Math.sin(P.yaw) * back, bz = P.z + Math.cos(P.yaw) * back;
      reflection.position.set(Math.min(xm - 0.35, Math.max(x0 + 0.35, bx)), 0, Math.min(-1.5, bz));
      reflection.rotation.y = Math.atan2(P.x - reflection.position.x, P.z - reflection.position.z);
    },
  };
}

// ---------- 7 · the underpass that loops (the calmest words, dose 4 injected) ----------
export function underpass(E, ctx) {
  const g = new THREE.Group();
  const wallM = lambert({ map: rep(tiles(150, 91, 8, [6, 6, -4]), 10, 2) });
  const cols = room(g, 3.4, 46, 2.7, wallM, lambert({ map: rep(tiles(90, 93, 16), 2, 23) }), lambert({ color: 0x9a978a }));
  const words = ctx.f.text.split(/\s+/);
  const graffiti = [];
  for (let i = 0; i < 6; i++) {
    const z = -4.5 - i * 3.4, s = i % 2 ? 1 : -1;
    const p = plane(g, 2.6, 1.0, basic({ map: wrapTex(128, 48, "rgba(0,0,0,0)", "#7a1010", "", 13, { bold: true }), transparent: true }), s * 1.69, 1.4, z, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    graffiti.push(p);
  }
  const exitSign = plane(g, 1.2, 0.3, basic({ map: textTex(96, 24, "#0c3a1a", "#e8ffe8", ["EXIT ↑"], "bold 14px monospace") }), 0, 2.4, -24);
  const tubes = []; for (let i = 0; i < 10; i++) tubes.push(box(g, 0.1, 0.04, 1.4, basic({ color: 0xfaf6e8 }), 0, 2.66, -3 - i * 4.4));
  const light = new THREE.PointLight(0xfff0d0, 3.6, 13, 1.3); g.add(light);
  const it = figure(1.8); it.position.set(0.3, 0, -40); g.add(it);
  let loops = 0, spoke = false;
  function paint() {
    const n = Math.min(words.length, 6 + loops * 7);
    graffiti.forEach((p, i) => {
      const chunk = words.slice(i * Math.ceil(n / 6), (i + 1) * Math.ceil(n / 6)).join(" ");
      p.material.map.dispose(); p.material.map = wrapTex(128, 48, "rgba(0,0,0,0)", loops > 1 ? "#b01818" : "#7a1010", chunk, 12, { bold: true }); p.material.needsUpdate = true;
    });
  }
  paint();
  return {
    group: g, colliders: cols, usables: [],
    atmos: { color: 0x34201a, density: 0.06, hemi: 0.5 }, hint: "Follow the exit.",
    update(dt, t, tok) {
      const P = E.P;
      if (P.z < -24.5) { // the passage repeats: you are back where you started, and it is closer
        P.z += 20.5; loops++; paint(); ctx.audio.thud(0.6);
        it.position.z = Math.min(-6, -40 + loops * 9);
        exitSign.material.map.dispose(); exitSign.material.map = textTex(96, 24, "#3a0c0c", "#ffe8e8", [loops >= 3 ? "↓ BACK" : "EXIT ↑"], "bold 14px monospace");
        if (loops >= 3 && !spoke) { spoke = true; ctx.speak({ who: "ON THE WALLS", style: "walls" }); }
      }
      light.position.set(0, 2.3, P.z - 2); light.intensity = 3.6 - loops * 0.4 + Math.sin(t * 20) * 0.1;
      tubes.forEach((tb) => tb.material.color.setScalar(Math.random() < 0.03 * (1 + loops) ? 0.1 : 0.9));
      it.rotation.y = Math.atan2(P.x - it.position.x, P.z - it.position.z);
    },
  };
}

// ---------- the top: the Records ----------
// A night office. On the desk, the injection log: the only thing that knows.
export function records(E, ctx) {
  const g = new THREE.Group();
  const cols = room(g, 6, 8, 2.8, lambert({ map: rep(noiseTex(64, 64, 120, 18, 4, 111, [8, 6, -2]), 4, 2) }), lambert({ map: rep(tiles(95, 113, 32, [6, 4, -2]), 3, 4) }), lambert({ color: 0xb8b0a0 }));
  const desk = new THREE.Group(); desk.position.set(0, 0, -5.4); g.add(desk);
  box(desk, 2.2, 0.08, 1.0, lambert({ color: 0x5a3e28 }), 0, 0.78, 0);
  [-1, 1].forEach((s) => box(desk, 0.5, 0.76, 0.9, lambert({ color: 0x4a3220 }), s * 0.8, 0.38, 0));
  const book = new THREE.Group(); book.position.set(0, 0.84, 0.05); desk.add(book);
  box(book, 0.62, 0.05, 0.44, lambert({ color: 0x5a1010 }), 0, 0, 0);
  plane(book, 0.56, 0.4, basic({ map: wrapTex(64, 48, "#efe6d0", "#3a2a1a", "INJECTION LOG · floors 1–7 · dose · words · guess", 7) }), 0, 0.03, 0, -Math.PI / 2);
  const lampL = new THREE.PointLight(0xffd090, 3.0, 6, 1.4); lampL.position.set(0.7, 1.45, -5.3); g.add(lampL);
  box(g, 0.05, 0.5, 0.05, lambert({ color: 0x2a2826 }), 0.75, 1.07, -5.35); box(g, 0.28, 0.14, 0.2, basic({ color: 0xffe0a0 }), 0.75, 1.36, -5.35);
  for (let k = 0; k < 4; k++) box(g, 0.6, 1.4, 0.5, lambert({ color: 0x6a6e66 }), -2.65, 0.7, -2.4 - k * 1.3, 0);
  plane(g, 1.6, 1.0, basic({ map: canvasTex(32, 20, (c) => { c.fillStyle = "#0a0d14"; c.fillRect(0, 0, 32, 20); c.fillStyle = "#3a4050"; for (let y = 1; y < 20; y += 3) c.fillRect(0, y, 32, 1); }) }), 0, 1.6, -9.13);
  let read = false, resolveRead;
  const logRead = new Promise((r) => (resolveRead = r));
  return {
    group: g, logRead,
    colliders: cols.concat([{ x0: -1.1, x1: 1.1, z0: -5.9, z1: -4.9 }, { x0: -2.95, x1: -2.35, z0: -6.6, z1: -2.1 }]),
    usables: [{ obj: book, range: 2.4, label: () => (read ? "the log" : "open the injection log"), use: async () => { await ctx.openLog(); if (!read) { read = true; resolveRead(); } } }],
    atmos: { color: 0x1a1612, density: 0.05, hemi: 0.5 }, hint: "There is a log on the desk.",
    update(dt, t) { lampL.intensity = 3.0 + Math.sin(t * 2.1) * 0.08; },
  };
}

// ---------- the top: nothing out there ----------
export function chamber(E, ctx) {
  const g = new THREE.Group();
  return { group: g, colliders: [{ x0: -3, x1: 3, z0: -1.6, z1: -1.3 }], usables: [], atmos: { color: 0x000000, density: 0.9, hemi: 0.05 }, hint: "", update() {} };
}
