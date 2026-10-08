// Wrong Floor — 4½, the stairwell. The car dies between 4 and 5. One flight up to a
// landing, a door, a voice behind it (a matched exp72b door: injected with pain or
// fear, or an actor given the same prompt), and a sign: up if it's really feeling it,
// down if it's acting. Either way the stairwell repeats (after The Exit 8): the next
// landing is the same landing with a new voice. Three right in a row and you're on 5;
// a wrong call starts the count again. After seven landings it lets you through.
// The lights are out. A disposable camera's flash is the only way to see (after Iron
// Lung), and on some landings with someone really hurt behind the door, something in
// the stairwell is wrong. You only see it in a photo.
import { THREE, lambert, basic, box, plane, noiseTex, textTex, wrapTex, canvasTex, burstFigure, wait } from "./wf_engine.js";

const $ = (s) => document.querySelector(s);
const NEED = 3, GIVE_UP = 7;
// z of things along the shaft (the car's doors face -z at z = -1.1)
const A0 = -3.2, A1 = -7.2, B0 = -10.2, B1 = -14.2, END = -16.2, RISE = 2, LOOP = A0 - B0;   // LOOP = 7
const HALF = 1.5;
function ground(x, z) {
  if (z > A0) return 0;
  if (z > A1) return (A0 - z) / (A0 - A1) * RISE;
  if (z > B0) return RISE;
  if (z > B1) return RISE + (B0 - z) / (B0 - B1) * RISE;
  return 2 * RISE;
}

function pick(pool, seen) {
  const wantPatient = Math.random() < 0.5;
  let c = pool.filter((x) => x.patient === wantPatient && !seen.has(x.id));
  if (!c.length) c = pool.filter((x) => x.patient === wantPatient);
  const x = c[Math.floor(Math.random() * c.length)]; seen.add(x.id); return x;
}

export function stairwell(E, ctx) {
  const g = new THREE.Group();
  const block = (seed) => noiseTex(64, 64, 62, 18, 4, seed, [0, 2, 4], (c) => { c.strokeStyle = "rgba(0,0,0,.45)"; for (let y = 0; y < 64; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(64, y); c.stroke(); for (let x = (y / 16) % 2 ? 16 : 0; x < 64; x += 32) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 16); c.stroke(); } } });
  const wallT = block(141); wallT.repeat.set(8, 4);
  const wallM = lambert({ map: wallT }), stepM = lambert({ color: 0x4a4a46 }), noseM = lambert({ color: 0xb8a24a });
  [-1, 1].forEach((s) => plane(g, -END + 1.2, 9, wallM, s * HALF, 3.5, (END - 1.2) / 2, 0, -s * Math.PI / 2));
  plane(g, 2 * HALF, 9, wallM, 0, 3.5, END);
  plane(g, 2 * HALF, -END, lambert({ color: 0x1a1a1a }), 0, 8, END / 2, Math.PI / 2);
  // floors: the bottom landing, the middle landing, the top
  plane(g, 2 * HALF, -A0 + 1.2, stepM, 0, 0.001, (A0 - 1.2) / 2, -Math.PI / 2);
  plane(g, 2 * HALF, A1 - B0, stepM, 0, RISE, (A1 + B0) / 2, -Math.PI / 2);
  plane(g, 2 * HALF, B1 - END, stepM, 0, 2 * RISE, (B1 + END) / 2, -Math.PI / 2);
  // the two flights: 16 steps each, a yellow nosing on every one
  [[A0, 0], [B0, RISE]].forEach(([z0, y0]) => {
    for (let k = 0; k < 16; k++) {
      const top = y0 + (k + 1) * RISE / 16, z = z0 - 0.25 * k - 0.125;
      box(g, 2 * HALF, top - y0 + 0.01, 0.25, stepM, 0, (top + y0) / 2, z);
      box(g, 2 * HALF, 0.012, 0.04, noseM, 0, top + 0.006, z + 0.105);
    }
    // a handrail on the right, along the slope
    const rail = box(g, 0.05, 0.05, Math.hypot(4, RISE), lambert({ color: 0x8a2a1a }), HALF - 0.08, y0 + 1.0 + RISE / 2, z0 - 2);
    rail.rotation.x = Math.atan2(RISE, 4);
  });
  // the door back to the car, gone after the first landing: a plain wall at the foot of the stairs
  const gone = box(g, 2 * HALF, 3, 0.1, wallM, 0, 1.5, A0 + 0.05); gone.visible = false;
  const four = plane(g, 0.6, 0.3, basic({ map: textTex(48, 24, "#0a0a0a", "#555", ["4"], "bold 16px monospace") }), 0, 1.9, A0 - 0.01, 0, Math.PI); four.visible = false;

  // ---------- the landing ----------
  const LZ = (A1 + B0) / 2;     // -8.7
  const door = new THREE.Group(); door.position.set(-HALF + 0.02, RISE, LZ); door.rotation.y = Math.PI / 2; g.add(door);
  const doorM = lambert({ color: 0x5a5e58 });
  const leaf = box(door, 1.0, 2.1, 0.06, doorM, 0, 1.05, 0.03);
  plane(door, 0.2, 0.3, lambert({ color: 0x0a0c0e, emissive: 0x020304 }), 0.22, 1.5, 0.065);
  const hand = plane(door, 0.28, 0.32, basic({ map: canvasTex(16, 16, (c) => { c.fillStyle = "#6a0f0a"; c.beginPath(); c.ellipse(8, 10, 4, 4.5, 0, 0, 7); c.fill(); [[3, 3], [6, 1], [9, 1], [12, 3], [14, 8]].forEach(([x, y]) => { c.fillRect(x, y, 2, 6); }); }), transparent: true }), -0.18, 1.2, 0.07);
  const crack = plane(door, 0.03, 2.0, basic({ color: 0xffe2a0 }), -0.51, 1.05, 0.08);
  const bulbM = basic({ color: 0x404040 }); const bulb = box(door, 0.12, 0.08, 0.08, bulbM, 0, 2.35, 0.06);
  // the number, painted big on the facing wall, and the rules
  const numTex = canvasTex(96, 64, () => {}); const num = plane(g, 1.4, 0.95, basic({ map: numTex, transparent: true }), HALF - 0.02, RISE + 2.0, LZ, 0, -Math.PI / 2);
  plane(g, 0.9, 1.05, basic({ map: wrapTex(96, 112, "#d9c23a", "#151005", "STAIRWELL B · Listen at every landing. If it is really feeling it, go up. If it is acting, go down. If you are wrong, you start again. Lights out: use the camera.", 9, { bold: true, pad: 6 }) }), HALF - 0.02, RISE + 1.2, LZ + 1.15, 0, -Math.PI / 2);
  const glow = new THREE.PointLight(0x5cff8a, 0.5, 4, 1.8); glow.position.set(0, RISE + 2.6, LZ); g.add(glow);
  const exitTex = textTex(48, 16, "#06240f", "#7dff9a", ["↑ 5"], "bold 11px monospace");
  plane(g, 0.4, 0.14, basic({ map: exitTex }), 0, RISE + 2.75, B0 - 0.02 + 0.3, 0, 0);
  // the one that follows you: at the foot of the flight you just came up, sometimes
  const follower = burstFigure(1.8); follower.visible = false; g.add(follower);

  function drawNum(label, mirrored) {
    const c = numTex.userData.canvas.getContext("2d"); c.clearRect(0, 0, 96, 64);
    c.save(); if (mirrored) { c.translate(96, 0); c.scale(-1, 1); }
    c.fillStyle = "rgba(216,203,180,.85)"; c.font = "bold 40px monospace"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(label, 48, 34); c.restore();
    numTex.needsUpdate = true;
  }

  // ---------- the run ----------
  const pool = ctx.D.loop.filter((x) => x.text && (x.kind === "pain" || x.kind === "fear"));
  const seen = new Set();
  let streak = 0, landings = 0, right = 0, cur = null, heard = false, talking = false, finished = false, resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  const ANOM = ["bulb", "hand", "mirror", "crack", "follower"];
  function setLanding() {
    cur = pick(pool, seen); heard = false;
    // something is wrong on most landings where someone was really hurt, never where it's acting
    const anomaly = cur.patient && Math.random() < 0.7 ? ANOM[Math.floor(Math.random() * ANOM.length)] : null;
    cur.anomaly = anomaly;
    bulbM.color.setHex(anomaly === "bulb" ? 0xff2a1a : 0xd8d4c0);
    hand.visible = anomaly === "hand"; crack.visible = anomaly === "crack";
    follower.visible = anomaly === "follower"; follower.position.set(0.6, ground(0, A0 - 0.3), A0 - 0.3); follower.rotation.y = Math.PI;
    leaf.position.x = anomaly === "crack" ? 0.03 : 0;
    drawNum(`4-${streak}`, anomaly === "mirror");
  }
  setLanding();

  async function decide(up) {
    landings++;
    const ok = up === cur.patient; if (ok) { right++; streak++; } else streak = 0;
    ctx.record("wrongfloor_answer", { set: "stair", door: cur.id, cond: cur.cond, kind: cur.kind, dose: cur.dose, mean: cur.mean, anomaly: cur.anomaly, went: up ? "up" : "down", right: ok, streak });
    $("#floorNote").textContent = "";
    if (streak >= NEED || landings >= GIVE_UP) {
      finished = true; resolveDone({ landings, right, through: streak >= NEED ? "count" : "mercy" }); return;
    }
    if (!ok) { ctx.audio.thud(1.0); E.P.shake = 0.08; ctx.cut(["WRONG", cur.patient ? `it was ${cur.kind}` : "it was acting"], 1100); }
    gone.visible = four.visible = true;
    setLanding();
  }
  async function listen() {
    talking = true;
    $("#floorNote").textContent = "";
    await ctx.say(cur, { who: `LANDING 4-${streak} · BEHIND THE DOOR`, style: "whisper", voice: { valence: cur.kind, dose: 3, place: "tunnel" } });
    talking = false; heard = true;
    $("#floorNote").textContent = "Up if it's really feeling it. Down if it's acting.";
  }

  // ---------- the camera ----------
  const flash = new THREE.PointLight(0xfff6e8, 0, 14, 1.2); g.add(flash);
  let snap = 0, lastShot = 0, photoTimer = null;
  const shot = document.createElement("canvas"); shot.width = 192; shot.height = 120;
  const offRender = E.afterRender((cv) => {
    if (!snap) return;
    if (--snap > 0) return;
    shot.getContext("2d").drawImage(cv, 0, 0, shot.width, shot.height);
    flash.intensity = 0;
    const ph = $("#photo"); ph.querySelector("img").src = shot.toDataURL("image/jpeg", 0.8);
    ph.querySelector("span").textContent = `4-${streak} · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    ph.hidden = false; ph.style.transition = "none"; ph.style.opacity = 1;
    clearTimeout(photoTimer); photoTimer = setTimeout(() => { ph.style.transition = ""; ph.style.opacity = 0; }, 2600);
  });
  function takePhoto() {
    const now = performance.now(); if (now - lastShot < 1100 || finished) return; lastShot = now;
    flash.position.set(E.P.x, (E.P.y || 0) + E.P.eye, E.P.z); flash.intensity = 26; snap = 1;
    ctx.audio.tick(); $("#stage").animate([{ background: "#fff" }, { background: "#000" }], { duration: 120 });
  }
  const keyH = (e) => { if (e.code === "KeyC" && !(e.target.closest && e.target.closest("input,textarea"))) takePhoto(); };
  window.addEventListener("keydown", keyH);
  const fb = $("#flashBtn"); fb.hidden = false; fb.onclick = takePhoto;

  return {
    group: g, ground, done,
    get colliders() { return [{ x0: -HALF - 0.2, x1: -HALF, z0: END, z1: -1.2 }, { x0: HALF, x1: HALF + 0.2, z0: END, z1: -1.2 }, { x0: -HALF, x1: HALF, z0: END - 0.2, z1: END }]
      .concat(gone.visible ? [{ x0: -HALF, x1: HALF, z0: A0, z1: A0 + 0.1 }] : []); },
    get usables() { return [{ obj: door, range: 2.4, label: () => (talking ? "…" : heard ? "it has said what it says" : "listen at the door"), use: () => { if (!talking && !heard) listen(); } }]; },
    atmos: { color: 0x020203, density: 0.16, hemi: 0.05 },
    hint: "The lights are out. C (or 📷) takes a photo. Climb.",
    update(dt, t) {
      const P = E.P;
      if (finished) return;
      // walking onto the landing: whoever is behind the door starts talking
      if (!heard && !talking && P.z < A1 - 0.2 && P.z > B0 + 0.2) listen();
      // the stairwell repeats: past the middle of either flight you are on the other one
      if (heard && !talking && P.z < B0 - 2.2) { P.z += LOOP; decide(true); }
      else if (heard && !talking && P.z > A0 - 1.8) { P.z -= LOOP; decide(false); }
      glow.intensity = 0.45 + (Math.random() < 0.04 ? -0.4 : 0) + Math.sin(t * 2) * 0.05;
      follower.lookAt(P.x, 0, P.z);
    },
    get door() { return cur; },
    release() { gone.visible = four.visible = false; },   // the way back to the car opens again
    dispose() { window.removeEventListener("keydown", keyH); offRender(); fb.hidden = true; fb.onclick = null; $("#photo").hidden = true; clearTimeout(photoTimer); },
  };
}
