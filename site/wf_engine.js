// Wrong Floor — engine: PSX renderer, procedural textures, primitives, and a
// first-person walker (WASD / drag-look / touch stick, AABB collisions,
// look-at-to-use). Floors and the car build on these helpers.
import * as THREE from "three";
export { THREE };

export const RES_W = 384, RES_H = 240;

// ---------- textures ----------
export function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.userData.canvas = c;
  return t;
}
export function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function noise(g, w, h, base, amp, cell, seed, tint = [0, 3, 2]) {
  const r = rnd(seed);
  for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
    const v = base + (r() - .5) * amp;
    g.fillStyle = `rgb(${v + tint[0]},${v + tint[1]},${v + tint[2]})`; g.fillRect(x, y, cell, cell);
  }
}
export function noiseTex(w, h, base, amp, cell, seed, tint, extra) {
  return canvasTex(w, h, (g) => { noise(g, w, h, base, amp, cell, seed, tint); extra && extra(g, w, h); });
}
export function textTex(w, h, bg, fg, lines, font) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    lines.forEach((l, i) => { g.font = (Array.isArray(font) ? font[i] || font[0] : font); g.fillText(l, w / 2, h * (i + 1) / (lines.length + 1)); });
  });
}
// wrap long text onto a canvas texture (graffiti, charts, posters)
export function wrapTex(w, h, bg, fg, text, px, opts = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = `${opts.bold ? "bold " : ""}${px}px ${opts.face || "monospace"}`;
    g.textBaseline = "top"; let y = opts.pad || 3, line = "";
    for (const word of text.split(/\s+/)) {
      const t = line ? line + " " + word : word;
      if (g.measureText(t).width > w - 2 * (opts.pad || 3)) { g.fillText(line, opts.pad || 3, y); y += px * 1.15; line = word; } else line = t;
      if (y > h - px) break;
    }
    if (line && y <= h - px) g.fillText(line, opts.pad || 3, y);
  });
}

// ---------- materials ----------
export function psx(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <project_vertex>",
      `#include <project_vertex>
       vec2 g = vec2(${RES_W / 2}.0, ${RES_H / 2}.0);
       gl_Position.xy = floor(gl_Position.xy / gl_Position.w * g + .5) / g * gl_Position.w;`);
  };
  return mat;
}
export const lambert = (o) => psx(new THREE.MeshLambertMaterial(o));
export const basic = (o) => psx(new THREE.MeshBasicMaterial(o));

// ---------- primitives ----------
export function box(parent, w, h, d, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
}
export function plane(parent, w, h, mat, x, y, z, rx = 0, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 2, 2), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); parent.add(m); return m;
}
export function figure(h = 1.78, color = 0x050404, eyes = true) {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, h * 0.62, 6), m); body.position.y = h * 0.47; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), m); head.position.y = h * 0.86; g.add(head);
  [-1, 1].forEach((s) => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, h * 0.36, 5), m); leg.position.set(s * 0.09, h * 0.18, 0); g.add(leg); });
  if (eyes) {
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xe8e2c8, fog: false });
    [-1, 1].forEach((s) => { const e = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.01), eyeM); e.position.set(s * 0.045, h * 0.87, 0.128); g.add(e); });
  }
  g.userData.body = m; return g;
}
// a seated figure (bench, pew, bed)
export function seated(color = 0x050404) {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.62, 6), m); torso.position.y = 0.78; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), m); head.position.y = 1.2; g.add(head);
  const lap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.42), m); lap.position.set(0, 0.5, 0.16); g.add(lap);
  return g;
}

// ---------- the walker ----------
export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1); renderer.setSize(RES_W, RES_H, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, RES_W / RES_H, 0.05, 90); camera.rotation.order = "YXZ";
  scene.fog = new THREE.FogExp2(0x8a948f, 0.05); scene.background = new THREE.Color(0x8a948f);
  const hemi = new THREE.HemisphereLight(0xb8c4bf, 0x1a1612, 0.55); scene.add(hemi);

  const P = { x: 0, z: 0.35, yaw: 0, pitch: -0.04, eye: 1.6, speed: 2.3, frozen: true, bob: 0, shake: 0, travel: 0 };
  const keys = new Set(); const stick = { x: 0, y: 0 };
  let colliders = [];     // [{x0,x1,z0,z1}]
  let usables = [];       // [{obj, label, use, range}]
  let hover = null;
  const onHover = [];

  window.addEventListener("keydown", (e) => {
    if (P.frozen || e.target.closest && e.target.closest("input,textarea,button,#zine,#survey")) return;
    const k = e.key.toLowerCase(); keys.add(k);
    if (k === "e" || k === " " || k === "enter") { if (hover) { e.preventDefault(); hover.use(); } }
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());

  // desktop: click the view to lock the mouse, then the mouse is your head and a
  // click uses what you're looking at (Esc frees it). Touch: drag to look, tap to use.
  const fine = matchMedia("(pointer:fine)").matches;
  const canLook = () => !P.frozen || P.lookOnly;
  const locked = () => document.pointerLockElement === canvas;
  function look(dx, dy, k) { if (!canLook()) return; P.yaw -= dx * k; P.pitch = Math.max(-1.1, Math.min(1.0, P.pitch - dy * k * 0.85)); }
  document.addEventListener("mousemove", (e) => { if (locked()) look(e.movementX, e.movementY, 0.0024); });
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && fine) {
      if (!locked()) { if (canLook() && canvas.requestPointerLock) { const r = canvas.requestPointerLock(); r && r.catch && r.catch(() => {}); } }
      else if (hover && !P.frozen) hover.use();
      return;
    }
    drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag || drag.id !== e.pointerId) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; look(dx, dy, 0.0062);
  });
  canvas.addEventListener("pointerup", () => { if (drag && drag.moved < 8 && hover && !P.frozen) hover.use(); drag = null; });
  // anything that needs the cursor gives it back
  const NEEDS_CURSOR = "#guess:not([hidden]),#zine:not([hidden]),#survey:not([hidden]),#lens:not([hidden]),#calls:not([hidden]),#ask:not([hidden]),#end:not([hidden]),#title:not([hidden]),#pick:not([hidden])";
  document.addEventListener("pointerlockchange", () => { canvas.classList.toggle("locked", locked()); });

  function blocked(x, z) {
    for (const c of colliders) if (x > c.x0 - 0.22 && x < c.x1 + 0.22 && z > c.z0 - 0.22 && z < c.z1 + 0.22) return true;
    return false;
  }
  const ray = new THREE.Raycaster(); ray.far = 3.2;
  function pickUsable() {
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    let best = null, bd = 99;
    for (const u of usables) {
      if (u.enabled === false) continue;
      const h = ray.intersectObject(u.obj, true)[0];
      if (h && h.distance < (u.range || 3.0) && h.distance < bd) { best = u; bd = h.distance; }
    }
    if (best !== hover) { hover = best; onHover.forEach((f) => f(hover)); }
  }

  const tickers = [];
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!P.frozen) {
      let f = 0, s = 0;
      if (keys.has("w") || keys.has("arrowup")) f += 1; if (keys.has("s") || keys.has("arrowdown")) f -= 1;
      if (keys.has("a")) s -= 1; if (keys.has("d")) s += 1;
      if (keys.has("arrowleft")) P.yaw += 1.9 * dt; if (keys.has("arrowright")) P.yaw -= 1.9 * dt;
      f += -stick.y; s += stick.x;
      const len = Math.hypot(f, s);
      if (len > 0.05) {
        const k = Math.min(1, len) / len * P.speed * dt;
        const dx = (-Math.sin(P.yaw) * f + Math.cos(P.yaw) * s) * k, dz = (-Math.cos(P.yaw) * f - Math.sin(P.yaw) * s) * k;
        if (!blocked(P.x + dx, P.z)) P.x += dx; if (!blocked(P.x, P.z + dz)) P.z += dz;
        P.bob += dt * 9;
      }
    }
    if (locked() && (document.querySelector(NEEDS_CURSOR) || !canLook())) document.exitPointerLock();
    tickers.forEach((t) => t(dt, now / 1000));
    const sh = P.travel * 0.006 + P.shake; P.shake *= 0.9;
    camera.position.set(P.x + (Math.random() - .5) * sh, P.eye + Math.sin(P.bob) * 0.025 + (Math.random() - .5) * sh, P.z);
    camera.rotation.set(P.pitch, P.yaw, 0);
    pickUsable();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    THREE, scene, camera, hemi, P, stick,
    setColliders(c) { colliders = c; },
    setUsables(u) { usables = u; hover = null; onHover.forEach((f) => f(null)); },
    onHover(f) { onHover.push(f); },
    tick(f) { tickers.push(f); return () => tickers.splice(tickers.indexOf(f), 1); },
    atmosphere(color, density, hemiI) {
      scene.fog.color.set(color); scene.background = new THREE.Color(color); scene.fog.density = density; hemi.intensity = hemiI;
    },
    inCar() { return Math.abs(P.x) < 1.0 && P.z > -1.0 && P.z < 1.0; },
    face(yaw, pitch = -0.04) { P.yaw = yaw; P.pitch = pitch; },
  };
}
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
