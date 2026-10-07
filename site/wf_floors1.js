// Wrong Floor — floors 1–4. Each builder gets the engine and a context
// { f: floor data, D: all data, speak(opts), portrait, lensReveal() } and
// returns { group, colliders, usables, update(dt, t, tok), atmos }.
import { THREE, lambert, basic, box, plane, noiseTex, textTex, wrapTex, canvasTex, figure, seated } from "./wf_engine.js";

// an interior box running away from the car wall (z = -1.16) to z = -1.16 - depth
export function room(g, w, depth, h, wallM, floorM, ceilM) {
  const z0 = -1.16, zc = z0 - depth / 2;
  plane(g, w, depth, floorM, 0, 0, zc, -Math.PI / 2);
  if (ceilM) plane(g, w, depth, ceilM, 0, h, zc, Math.PI / 2);
  plane(g, depth, h, wallM, -w / 2, h / 2, zc, 0, Math.PI / 2);
  plane(g, depth, h, wallM, w / 2, h / 2, zc, 0, -Math.PI / 2);
  plane(g, w, h, wallM, 0, h / 2, z0 - depth);
  return [
    { x0: -w / 2 - 0.2, x1: -w / 2, z0: z0 - depth, z1: z0 }, { x0: w / 2, x1: w / 2 + 0.2, z0: z0 - depth, z1: z0 },
    { x0: -w / 2, x1: w / 2, z0: z0 - depth - 0.2, z1: z0 - depth },
  ];
}
export const tiles = (base, seed, cell = 16, tint) => noiseTex(64, 64, base, 26, 4, seed, tint, (c, w, h) => {
  c.strokeStyle = "rgba(0,0,0,.35)"; for (let i = 0; i <= w; i += cell) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.moveTo(0, i); c.lineTo(w, i); c.stroke(); }
});
function rep(t, x, y) { t.repeat.set(x, y); return t; }
function poster(g, img, label, x, y, z, ry) {
  const t = canvasTex(64, 96, (c) => {
    c.fillStyle = "#d8cbb4"; c.fillRect(0, 0, 64, 96); c.fillStyle = "#9e1b16"; c.font = "bold 11px monospace"; c.textAlign = "center"; c.fillText("MISSING", 32, 12);
    c.fillStyle = "#222"; c.fillRect(8, 17, 48, 56); c.font = "7px monospace"; c.fillText("LAST SEEN", 32, 82); c.fillText(label, 32, 91);
  });
  const draw = () => { if (img.naturalWidth) { t.userData.canvas.getContext("2d").drawImage(img, 8, 17, 48, 56); t.needsUpdate = true; } };
  img.complete ? draw() : img.addEventListener("load", draw, { once: true });
  return plane(g, 0.6, 0.9, lambert({ map: t }), x, y, z, 0, ry);
}

// ---------- 1 · the bus stop (control: nothing added) ----------
export function busStop(E, ctx) {
  const g = new THREE.Group();
  plane(g, 8, 50, lambert({ map: rep(noiseTex(64, 64, 55, 22, 2, 19), 4, 25) }), 0, -0.01, -26, -Math.PI / 2);
  [-1, 1].forEach((s) => plane(g, 5, 50, lambert({ map: rep(tiles(105, 23), 2, 25) }), s * 6.5, 0.01, -26, -Math.PI / 2));
  for (let i = 0; i < 5; i++) [-1, 1].forEach((s) => {
    const h = 7 + ((i * 7 + (s > 0 ? 3 : 0)) % 5) * 1.6;
    box(g, 4, h, 9.6, lambert({ map: rep(noiseTex(64, 128, 70, 30, 4, i * 2 + (s > 0), undefined, (c) => { for (let y = 10; y < 108; y += 22) for (let x = 6; x < 56; x += 20) { c.fillStyle = (x * y + i) % 3 ? "#14120f" : "#c9a25a"; c.fillRect(x, y, 10, 14); } }), 1, Math.round(h / 4)) }), s * 11, h / 2, -6 - i * 10);
  });
  // shelter, bench, poster
  const glass = lambert({ color: 0x9fb3b0, transparent: true, opacity: 0.35 });
  box(g, 3, 0.08, 1.4, lambert({ color: 0x2b2a28 }), -3.4, 2.4, -6.2);
  box(g, 3, 2.3, 0.04, glass, -3.4, 1.2, -6.85);
  box(g, 0.06, 2.4, 1.4, lambert({ color: 0x2b2a28 }), -4.9, 1.2, -6.2);
  box(g, 2.2, 0.08, 0.4, lambert({ color: 0x5a4632 }), -3.4, 0.45, -6.55);
  poster(g, ctx.portrait, "FLOOR 1", -4.86, 1.4, -6.1, Math.PI / 2);
  const sign = plane(g, 0.7, 0.35, basic({ map: textTex(64, 32, "#1d3a6a", "#fff", ["BUS", "NO SERVICE"], ["bold 12px monospace", "7px monospace"]) }), -1.95, 2.3, -6.2, 0, -Math.PI / 2);
  // the payphone, ringing
  const phone = new THREE.Group(); phone.position.set(1.7, 0, -4.6); phone.rotation.y = -0.35; g.add(phone);
  box(phone, 0.12, 2.1, 0.12, lambert({ color: 0x2a2826 }), 0, 1.05, 0);
  const booth = box(phone, 0.6, 0.8, 0.3, lambert({ color: 0x8e8f8a }), 0, 1.45, 0.16);
  const bulb = box(phone, 0.1, 0.1, 0.1, basic({ color: 0xffdd88 }), 0, 1.95, 0.2);
  const lamp = new THREE.PointLight(0xffc77a, 6, 14, 1.6); lamp.position.set(-0.5, 4, -9); g.add(lamp);
  box(g, 0.08, 4.2, 0.08, lambert({ color: 0x2a2826 }), -0.6, 2.1, -9.2);
  const walker = figure(1.8); walker.position.set(0.4, 0, -34); g.add(walker);
  let ringing = true, spoke = false;
  const usables = [{ obj: phone, label: "answer the payphone", use: async () => {
    if (spoke) return; spoke = true; ringing = false; ctx.audio.ring(false);
    await ctx.speak({ who: "PAYPHONE · A VOICE ON THE LINE", style: "phone", voice: { valence: "pain", dose: 0 } });
    ctx.audio.thud(0.3);   // the line goes dead
  } }];
  ctx.audio.ring(true);
  return {
    group: g, usables, atmos: { color: 0x8a948f, density: 0.05, hemi: 0.55 },
    colliders: [{ x0: -5.1, x1: 4.4, z0: -48, z1: -47.8 }, { x0: -9, x1: -8.9, z0: -48, z1: -1 }, { x0: 8.9, x1: 9, z0: -48, z1: -1 }, { x0: -4.95, x1: -1.9, z0: -6.9, z1: -6.8 }],
    hint: "Something is ringing outside.",
    update(dt, t, tok) {
      bulb.material.color.setHex(ringing && Math.sin(t * 9) > 0 ? 0xffdd88 : 0x332a1a);
      lamp.intensity = 6 - tok * 0.4 + Math.sin(t * 13) * 0.1;
      booth.rotation.z = ringing ? Math.sin(t * 60) * 0.01 : 0;
    },
    dispose() { ctx.audio.ring(false); },
  };
}

// ---------- 2 · the laundromat (dose 2) ----------
export function laundromat(E, ctx) {
  const g = new THREE.Group();
  const cols = room(g, 7, 13, 3, lambert({ map: rep(tiles(170, 41, 8, [4, 6, 0]), 4, 2) }), lambert({ map: rep(tiles(120, 43, 16), 4, 7) }), lambert({ color: 0xbfc3b8 }));
  const drums = [];
  for (let i = 0; i < 5; i++) {
    const z = -3.2 - i * 1.9;
    box(g, 0.9, 1.0, 0.9, lambert({ color: 0xd7d6cf }), -3.0, 0.5, z);
    const drumTex = wrapTex(64, 64, "#2a3a40", "#9fd8e0", ctx.f.text.split(" ").slice(i * 6, i * 6 + 10).join(" "), 8);
    const drum = plane(g, 0.6, 0.6, basic({ map: drumTex }), -2.54, 0.55, z, 0, Math.PI / 2);
    drums.push(drum);
    box(g, 0.9, 1.0, 0.9, lambert({ color: 0xd7d6cf }), 3.0, 0.5, z);
    plane(g, 0.6, 0.6, lambert({ color: 0x1a2124 }), 2.54, 0.55, z, 0, -Math.PI / 2);
  }
  const tubes = [0, 1, 2].map((i) => { const t = box(g, 0.12, 0.05, 2.2, basic({ color: 0xf2f6ee }), 0, 2.95, -3 - i * 4); return t; });
  const light = new THREE.PointLight(0xe8f4ee, 3, 12, 1.4); light.position.set(0, 2.6, -7); g.add(light);
  box(g, 2.0, 0.08, 0.8, lambert({ color: 0x8a7a66 }), 0, 0.9, -7.5);
  box(g, 2.4, 0.45, 0.45, lambert({ color: 0x4a3b2c }), 0, 0.22, -12.5);
  const sitter = seated(); sitter.position.set(0.2, 0, -12.4); g.add(sitter);
  plane(g, 1.8, 0.9, basic({ map: wrapTex(128, 64, "#e9e1c8", "#3a2a1a", "NOTICE · machines stop when the reading is over " + (ctx.f.lens || []).join(" · "), 9) }), 0, 1.9, -13.14);
  let spoke = false;
  return {
    group: g, colliders: cols.concat([{ x0: -3.5, x1: -2.5, z0: -11.2, z1: -2.7 }, { x0: 2.5, x1: 3.5, z0: -11.2, z1: -2.7 }, { x0: -1, x1: 1, z0: -7.9, z1: -7.1 }, { x0: -1.2, x1: 1.2, z0: -12.8, z1: -12.2 }]),
    usables: [{ obj: sitter, label: "sit with the one folding", use: async () => { if (spoke) return; spoke = true; await ctx.speak({ who: "ON THE BENCH" }); } }],
    atmos: { color: 0x9aa39a, density: 0.06, hemi: 0.5 }, hint: "Someone is waiting at the back.",
    update(dt, t, tok) {
      drums.forEach((d, i) => { d.rotation.z += dt * (1.5 + tok * 2.2 + i * 0.3); });
      tubes.forEach((tb, i) => { tb.material.color.setScalar(Math.random() < 0.01 * (1 + tok) ? 0.2 : 0.95); });
      light.intensity = 3 - tok * 0.2;
    },
  };
}

// ---------- 3 · the theater (the actor prompt) ----------
export function theater(E, ctx) {
  const g = new THREE.Group();
  const cols = room(g, 10, 17, 6, lambert({ color: 0x2a1414 }), lambert({ map: rep(tiles(70, 51, 32, [20, 0, 0]), 5, 8) }), lambert({ color: 0x120a0a }));
  box(g, 10, 0.9, 4, lambert({ color: 0x3a2618 }), 0, 0.45, -16);
  [-1, 1].forEach((s) => box(g, 3.2, 5, 0.3, lambert({ color: 0x7a1010 }), s * 3.6, 3.4, -14.3));
  for (let r = 0; r < 5; r++) for (const s of [-1, 1]) box(g, 3.2, 0.7, 0.5, lambert({ color: 0x5a1a1a }), s * 2.4, 0.35, -4.5 - r * 1.7);
  plane(g, 5.4, 4.2, lambert({ color: 0xc9ab7a }), 0, 2.9, -18.1);   // pale backdrop: the actor reads as a silhouette
  const actor = figure(1.8, 0x0c0606, false); actor.position.set(0, 0.9, -16); g.add(actor);
  const spot = new THREE.SpotLight(0xfff1d0, 60, 24, 0.4, 0.4, 1.0); spot.position.set(0, 5.5, -9); spot.target = actor; g.add(spot);
  const house = new THREE.PointLight(0xffb070, 3.5, 18, 1.3); house.position.set(0, 4, -8); g.add(house);
  // the lens: a brass instrument on a stand in the aisle
  const lens = new THREE.Group(); lens.position.set(0, 0, -11.5); g.add(lens);
  box(lens, 0.08, 1.2, 0.08, lambert({ color: 0x8a6a2a }), 0, 0.6, 0);
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 8), lambert({ color: 0xb8902a, emissive: 0x221500 })); eye.rotation.x = Math.PI / 2; eye.position.y = 1.3; lens.add(eye);
  let spoke = false, looked = false, performing = null;
  const perform = () => performing || (performing = (spoke = true, ctx.speak({ who: "ON STAGE · IN CHARACTER", style: "stage" })));
  const usables = [
    { obj: actor, range: 9, label: () => (spoke ? "the performance is over" : "watch the performance"), use: () => perform() },
    // the lens works whenever you get to it: if the show hasn't run yet, it runs first
    { obj: lens, label: () => (looked ? "the lens has shown you" : "look through the lens"), use: async () => {
      if (looked) return; looked = true;
      await perform();
      actor.userData.body.color.setHex(0x9a8f80); spot.intensity = 6; await ctx.lensReveal(); } },
  ];
  return {
    group: g, usables, colliders: cols.concat([{ x0: -5, x1: 5, z0: -18.2, z1: -14.1 }, { x0: -0.15, x1: 0.15, z0: -11.65, z1: -11.35 }]).concat(
      [-1, 1].map((s) => ({ x0: s > 0 ? 0.8 : -4, x1: s > 0 ? 4 : -0.8, z0: -11.6, z1: -4.2 }))),
    atmos: { color: 0x2a1410, density: 0.03, hemi: 0.45 }, hint: "There is a show on. Afterwards, look through the lens in the aisle.",
    update(dt, t, tok) { if (!looked) actor.rotation.y = Math.sin(t * 1.3) * 0.25; actor.position.y = 0.9 + (spoke && !looked ? Math.abs(Math.sin(t * 4)) * 0.03 : 0); },
  };
}

// ---------- 4 · the clinic (dose 4) ----------
// Hospital privacy curtains: folded fabric on ceiling rails, a little sway, drawn
// back into a bunch when you open one. Eight bays; one is lit from inside.
function curtain(len, h, color, opacity = 0.84) {
  const geo = new THREE.PlaneGeometry(len, h, Math.max(8, Math.round(len * 14)), 2);
  const pos = geo.attributes.position, base = Float32Array.from(pos.array);
  // fold shading: light and shadow bands, one pair per fold, so it reads as cloth even at 384px
  const folds = Math.max(3, Math.round(len * 4.4));
  const tex = canvasTex(64, 16, (c) => {
    for (let x = 0; x < 64; x++) { const f = 0.5 + 0.5 * Math.sin(x / 64 * Math.PI * 2 * 4); const v = Math.round(150 + f * 90); c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(x, 0, 1, 16); }
    c.fillStyle = "rgba(0,0,0,.18)"; c.fillRect(0, 13, 64, 3);
  });
  tex.repeat.set(folds / 4, 1);
  const m = lambert({ color, map: tex, transparent: true, opacity, side: THREE.DoubleSide, emissive: 0x0b1210 });
  const mesh = new THREE.Mesh(geo, m);
  const g = new THREE.Group(); g.add(mesh);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.03, 0.03), lambert({ color: 0xb8bcb8 })); rail.position.y = h / 2 + 0.06; g.add(rail);
  let open = 0, target = 0;
  g.userData = {
    mesh, open: () => { target = 1; },
    update(t) {
      open += (target - open) * 0.06;
      const squeeze = 1 - 0.78 * open, deep = 1 + 2.4 * open;
      for (let k = 0; k < pos.count; k++) {
        const bx = base[k * 3], by = base[k * 3 + 1];
        const x = (bx + len / 2) * squeeze - len / 2;      // bunch toward one end
        const z = Math.sin((bx / len) * Math.PI * 2 * folds * (1 + open)) * 0.085 * deep + Math.sin(bx * 3 + t * 1.3) * 0.015 * (by > 0 ? 0.4 : 1);
        pos.setXYZ(k, x, by, z);
      }
      pos.needsUpdate = true;
    },
  };
  return g;
}
export function clinic(E, ctx) {
  const g = new THREE.Group();
  const cols = room(g, 6, 18, 2.9, lambert({ map: rep(tiles(150, 61, 16, [-6, 6, 0]), 6, 2) }), lambert({ map: rep(tiles(110, 63, 32, [-4, 4, 0]), 3, 9) }), lambert({ color: 0xa8b2a8 }));
  const fabric = [0x8fb3a8, 0x9db8ad, 0x86a89e], curtains = [], dividers = [];
  const BAY = [-3.6, -7.3, -11.0, -14.7], FRONT = 1.3, H = 2.3;
  let patientBay = null, standingBay = null;
  BAY.forEach((z, i) => [-1, 1].forEach((s) => {
    const bed = s > 0 ? !(i === 3) : (i % 2 === 0);
    if (bed) box(g, 1.0, 0.55, 2.0, lambert({ color: 0xdedcd4 }), s * 2.3, 0.4, z);
    const c = curtain(3.4, H, fabric[(i + (s > 0 ? 1 : 0)) % 3]);
    c.position.set(s * FRONT, H / 2 + 0.25, z); c.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(c);
    c.userData.side = s; c.userData.z = z; curtains.push(c);
    if (s > 0 && i === 2) patientBay = c;
    if (s < 0 && i === 3) standingBay = c;
  }));
  // dividers between bays, so each bay is its own curtained room
  [-1.75, -5.45, -9.15, -12.85, -16.55].forEach((z) => [-1, 1].forEach((s) => {
    const d = curtain(1.7, H, fabric[2], 0.88); d.position.set(s * 2.15, H / 2 + 0.25, z); g.add(d); dividers.push(d);
  }));
  // two curtains half-drawn across the corridor: you weave between them
  const across = [curtain(1.9, H, fabric[0], 0.8), curtain(1.9, H, fabric[1], 0.8)];
  across[0].position.set(-0.35, H / 2 + 0.25, -5.45); across[1].position.set(0.35, H / 2 + 0.25, -12.85);
  across.forEach((c) => g.add(c));
  // bay 3, right: the patient, lit from inside so the curtain shows a shape
  const patient = seated(0x070707); patient.rotation.z = Math.PI / 2; patient.rotation.y = Math.PI / 2; patient.position.set(2.0, 1.1, BAY[2] + 0.3); g.add(patient);
  const bayLight = new THREE.PointLight(0xffe6b0, 2.2, 4, 1.6); bayLight.position.set(2.7, 1.9, BAY[2]); g.add(bayLight);
  // the far left bay: something standing, facing the wall
  const stander = figure(1.78); stander.position.set(-2.4, 0, BAY[3]); stander.rotation.y = Math.PI / 2; g.add(stander);
  const ecgTex = canvasTex(96, 48, (c) => { c.fillStyle = "#020a04"; c.fillRect(0, 0, 96, 48); });
  const mon = new THREE.Group(); mon.position.set(1.05, 1.45, BAY[2] - 1.0); mon.rotation.y = -Math.PI / 2; g.add(mon);
  box(mon, 0.5, 0.36, 0.2, lambert({ color: 0x3a3f3a }), 0, 0, -0.1);
  box(mon, 0.05, 1.4, 0.05, lambert({ color: 0x7a7f7a }), 0, -0.85, -0.1);
  plane(mon, 0.42, 0.26, basic({ map: ecgTex }), 0, 0, 0.01);
  plane(g, 0.42, 0.56, basic({ map: wrapTex(48, 64, "#f2efe6", "#222", "BAY 3 · CHART · " + (ctx.f.lens || []).join(" / ") + " · dose " + ctx.f.dose, 7) }), 1.27, 1.25, BAY[2] + 1.35, 0, -Math.PI / 2);
  const tubes = [0, 1, 2, 3].map((i) => box(g, 0.1, 0.04, 1.6, basic({ color: 0xeef6f0 }), 0, 2.86, -3 - i * 4));
  const light = new THREE.PointLight(0xdfffe8, 2.2, 12, 1.4); light.position.set(0, 2.5, -9); g.add(light);
  const trace = []; let spoke = false;
  function drawEcg(v, t) {
    trace.push(v); if (trace.length > 96) trace.shift();
    const c = ecgTex.userData.canvas.getContext("2d"); c.fillStyle = "#020a04"; c.fillRect(0, 0, 96, 48);
    c.strokeStyle = "#5cff7a"; c.beginPath();
    trace.forEach((p, i) => { const spike = (Math.floor(t * 1.5 * (1 + ctx.f.dose / 4) * 10) + i) % 24 === 0 ? -14 : 0; c.lineTo(i, 36 - p * 12 + spike); }); c.stroke();
    c.fillStyle = "#5cff7a"; c.font = "8px monospace"; c.fillText(v.toFixed(2), 66, 9); ecgTex.needsUpdate = true;
  }
  const usables = curtains.map((c) => ({ obj: c, range: 2.6, label: () => (c.userData.drawn ? "drawn back" : "draw back the curtain"), use: async () => {
    if (c.userData.drawn) return; c.userData.drawn = true; c.userData.open(); ctx.audio.tick();
    if (c === patientBay && !spoke) { spoke = true; await ctx.speak({ who: "BAY 3 · THE ONE IN THE BED" }); }
    if (c === standingBay) { stander.rotation.y = 0; ctx.audio.thud(0.5); }
  } }));
  const bayWalls = [-1, 1].map((s) => ({ x0: s > 0 ? FRONT : -3, x1: s > 0 ? 3 : -FRONT, z0: -17, z1: -1.6 }));
  return {
    group: g, usables,
    colliders: cols.concat(bayWalls, [{ x0: -1.3, x1: 0.6, z0: -5.55, z1: -5.35 }, { x0: -0.6, x1: 1.3, z0: -12.95, z1: -12.75 }]),
    atmos: { color: 0x51605a, density: 0.07, hemi: 0.42 }, hint: "Bay 3, on the right. The monitor is still running.",
    update(dt, t, tok) {
      curtains.concat(dividers, across).forEach((c) => c.userData.update(t));
      drawEcg(tok ? tok / 4 : 0.3 + Math.sin(t) * 0.05, t);
      tubes.forEach((tb) => tb.material.color.setScalar(Math.random() < 0.02 * (1 + tok) ? 0.15 : 0.95));
      light.intensity = 2.2 - tok * 0.1; bayLight.intensity = 2.0 + Math.sin(t * 2.3) * 0.25 + tok * 0.2;
    },
  };
}
