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
// a plain human shape: your reflection, and the body under the burst-headed follower
function humanFigure(h, color, eyes) {
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

// ---------- the residents: not people. Whatever answers from inside the chamber ----------
// Tentacles sway on their own: every live one is in SWAY, and the engine's frame moves them.
const SWAY = new Set();
function tentacle(parent, m, len, r0, segs, x, y, z, phase, droop = 1, splay = 0) {
  let at = new THREE.Group(); at.position.set(x, y, z); parent.add(at);
  const root = at, seg = len / segs, joints = [];
  for (let i = 0; i < segs; i++) {
    const r = r0 * (1 - i / segs) + 0.004;
    const piece = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, seg, 5), m); piece.position.y = -seg / 2; at.add(piece);
    const next = new THREE.Group(); next.position.y = -seg; at.add(next); joints.push(at); at = next;
  }
  root.rotation.x = 0.25 * droop; root.rotation.z = splay;
  root.userData.sway = { joints, phase, amp: 0.28 + Math.random() * 0.14, speed: 0.9 + Math.random() * 0.7 };
  SWAY.add(root); return root;
}
export function swayAll(t) {
  for (const root of SWAY) {
    if (!root.parent) { SWAY.delete(root); continue; }
    const { joints, phase, amp, speed } = root.userData.sway;
    joints.forEach((j, i) => { if (i) { j.rotation.x = Math.sin(t * speed + phase + i * 0.7) * amp; j.rotation.z = Math.cos(t * speed * 0.8 + phase + i * 0.9) * amp * 0.6; } });
  }
}
// the head: long, tipped forward, a cluster of mismatched eyes, a beard of tentacles where a mouth would be
function alienHead(parent, m, y, eyes, seed) {
  const head = new THREE.Group(); head.position.set(0, y, 0.03); head.rotation.x = 0.35; head.scale.setScalar(1.25); parent.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 6), m); skull.scale.set(0.95, 1.7, 1.15); skull.position.y = 0.06; head.add(skull);
  const brow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), m); brow.scale.set(1.2, 0.5, 0.9); brow.position.set(0, 0.0, 0.06); head.add(brow);
  if (eyes) {
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xd8f0a8, fog: false });
    const spots = [[-0.045, 0.03, 0.022], [0.05, 0.045, 0.016], [0.0, 0.1, 0.012], [-0.02, -0.02, 0.01], [0.075, 0.0, 0.009]];
    spots.slice(0, 3 + (seed % 3)).forEach(([ex, ey, r]) => { const e = new THREE.Mesh(new THREE.CircleGeometry(r, 6), eyeM); e.position.set(ex, ey + 0.04, 0.142); head.add(e); });
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 6 - 0.5) * 1.5;
    tentacle(head, m, 0.3 + ((k * 7 + seed) % 4) * 0.06, 0.034, 5, Math.sin(a) * 0.08, -0.1, 0.06 + Math.cos(a) * 0.02, k * 1.3 + seed, 1, -a * 0.55);
  }
  return head;
}
// an arm too long for the body: hangs past the knee, three fingers
function alienArm(parent, m, side, h, seed, bend = 0.12) {
  const sh = new THREE.Group(); sh.position.set(side * 0.2, h * 0.72, 0); sh.rotation.z = side * bend; parent.add(sh);
  const up = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, h * 0.32, 5), m); up.position.y = -h * 0.16; sh.add(up);
  const el = new THREE.Group(); el.position.y = -h * 0.32; el.rotation.x = -0.15; sh.add(el);
  const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, h * 0.3, 5), m); lo.position.y = -h * 0.15; el.add(lo);
  [-1, 0, 1].forEach((f) => tentacle(el, m, 0.2, 0.016, 4, f * 0.025, -h * 0.3, 0, seed + f, 0.3, f * 0.35));
  return sh;
}
// opts.human: the old human shape (no eyes on the silhouette unless asked)
export function figure(h = 1.78, color = 0x050404, eyes = true, opts = {}) {
  if (opts.human) return humanFigure(h, color, eyes);
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color }), seed = Math.floor(Math.random() * 7);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.13, h * 0.42, 6), m); torso.position.set(0, h * 0.58, 0.03); torso.rotation.x = 0.18; g.add(torso);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), m); hump.scale.set(1.3, 0.8, 1); hump.position.set(0, h * 0.75, -0.04); g.add(hump);
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, h * 0.12, 6), m); hips.position.y = h * 0.37; g.add(hips);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, h * 0.1, 5), m); neck.position.set(0, h * 0.8, 0.07); neck.rotation.x = 0.4; g.add(neck);
  alienHead(g, m, h * 0.86, eyes, seed);
  [-1, 1].forEach((s) => { alienArm(g, m, s, h, seed + s * 3);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, h * 0.34, 5), m); leg.position.set(s * 0.09, h * 0.17, 0); g.add(leg); });
  // two more down the back, slow
  [-1, 1].forEach((s) => tentacle(g, m, 0.7, 0.04, 6, s * 0.12, h * 0.76, -0.14, seed * 2 + s, 0.5, s * 0.8));
  g.userData.body = m; return g;
}
// the one that follows you: a coat, and for a head a burst of warm rays, a little uneven
export function burstFigure(h = 1.78, color = 0x050404) {
  const g = figure(h, color, false, { human: true });
  g.children.forEach((c) => { if (c.geometry && c.geometry.type === "SphereGeometry") c.visible = false; });
  const head = new THREE.Group(); head.position.set(0, h * 0.87, 0.02); g.add(head);
  const rayM = new THREE.MeshBasicMaterial({ color: 0xd97757 });
  const N = 11;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + Math.sin(k * 2.3) * 0.12, len = 0.15 + ((k * 37) % 5) * 0.012;
    const ray = new THREE.Mesh(new THREE.BoxGeometry(0.042 - ((k * 13) % 3) * 0.006, len, 0.035), rayM);
    ray.position.set(Math.sin(a) * len * 0.5, Math.cos(a) * len * 0.5, 0); ray.rotation.z = -a; head.add(ray);
  }
  g.userData.burst = head; return g;
}
// a seated resident (bench, pew, the edge of a bed): seat height 0.5, facing +z; arms on the knees
export function seated(color = 0x050404, opts = {}) {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color }), seed = Math.floor(Math.random() * 7), h = 1.7;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.6, 6), m); torso.position.set(0, 0.82, -0.02); torso.rotation.x = 0.28; g.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 5), m); neck.position.set(0, 1.15, 0.1); neck.rotation.x = 0.6; g.add(neck);
  g.userData.head = alienHead(g, m, 1.24, opts.eyes !== false, seed);
  const lap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.44), m); lap.position.set(0, 0.52, 0.18); g.add(lap);
  [-1, 1].forEach((s) => {
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.5, 5), m); shin.position.set(s * 0.09, 0.25, 0.4); g.add(shin);
    const arm = alienArm(g, m, s, 1.0, seed + s, 0.05); arm.position.set(s * 0.19, 1.04, 0.02); arm.rotation.x = -0.55;
  });
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), m); hump.scale.set(1.3, 0.8, 1); hump.position.set(0, 1.05, -0.08); g.add(hump);
  [-1, 1].forEach((s) => tentacle(g, m, 0.6, 0.035, 6, s * 0.1, 1.05, -0.18, seed + s, 0.6, s * 0.7));
  g.userData.body = m; return g;
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

  // movement by key POSITION (e.code), so WASD is the same keys on AZERTY, Dvorak, QWERTZ…
  const MOVE = { KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", KeyD: "r", ArrowLeft: "tl", ArrowRight: "tr" };
  window.addEventListener("keydown", (e) => {
    if (P.frozen || e.target.closest && e.target.closest("input,textarea,#zine,#survey")) return;
    if (MOVE[e.code]) keys.add(MOVE[e.code]);
    // a button you just clicked keeps focus: walking still works, but Space/Enter belong to it
    if (e.target.closest && e.target.closest("button")) return;
    const use = e.code === "KeyE" || e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter" || e.key === "e" || e.key === "E";
    if (use && hover) { e.preventDefault(); hover.use(); }
    if (/^Arrow|^Space$/.test(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => { if (MOVE[e.code]) keys.delete(MOVE[e.code]); });
  window.addEventListener("blur", () => keys.clear());

  // desktop: click the view to lock the mouse, then the mouse is your head and a
  // click uses what you're looking at (Esc frees it). Touch: drag to look, tap to use.
  const fine = matchMedia("(pointer:fine)").matches;
  const canLook = () => !P.frozen || P.lookOnly;
  const locked = () => document.pointerLockElement === canvas;
  function look(dx, dy, k) { if (!canLook()) return; P.yaw -= dx * k; P.pitch = Math.max(-1.1, Math.min(1.0, P.pitch - dy * k * 0.85)); }
  // captured: the mouse turns your head (big one-frame jumps are a browser glitch, dropped).
  // free: the mouse points, and clicking a thing uses it; clicking anything else captures.
  let mouse = null, wantLock = false, autoExit = false;
  document.addEventListener("mousemove", (e) => {
    if (locked()) {
      if (!e.isTrusted) return; // our own forwarded moves
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      if (cursorMode()) return steer(e.movementX, e.movementY);
      look(e.movementX, e.movementY, 0.0024); return;
    }
    V.x = e.clientX; V.y = e.clientY;
    const r = canvas.getBoundingClientRect();
    mouse = e.target === canvas ? { x: (e.clientX - r.left) / r.width * 2 - 1, y: -((e.clientY - r.top) / r.height * 2 - 1) } : null;
  });
  function lock() {
    if (!canvas.requestPointerLock) return;
    const plain = () => { const r = canvas.requestPointerLock(); r && r.catch && r.catch(() => {}); };
    try { const r = canvas.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(plain); } catch { plain(); }
  }
  document.addEventListener("pointerlockchange", () => { if (locked()) wantLock = true; else { if (!autoExit) wantLock = false; autoExit = false; } });
  // after a panel closes (a guess, a page, the log), take the mouse back if you had given it
  document.addEventListener("click", () => setTimeout(() => {
    if (fine && wantLock && !locked() && !document.querySelector("#title:not([hidden]),#end:not([hidden])")) lock();
  }, 60), true);
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && fine) {
      if (!locked()) { if (hover && !P.frozen) hover.use(); else if (canLook()) lock(); }
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
  // the guess strip doesn't take the mouse: you can walk away from it, and 1 / 2 / 3 answer it
  const NEEDS_CURSOR = "#zine:not([hidden]),#survey:not([hidden]),#lens:not([hidden]),#calls:not([hidden]),#ask:not([hidden]),#end:not([hidden]),#title:not([hidden]),#pick:not([hidden])";
  document.addEventListener("pointerlockchange", () => { canvas.classList.toggle("locked", locked()); if (locked()) V.fresh = true; });

  // ---------- the mouse stays held, like Doom ----------
  // Once captured, the mouse is not handed back when a panel opens (re-capturing needs another
  // click, and browsers refuse it for ~1s after a release). Panels get an in-game pointer
  // instead, steered by the same mouse; its presses, drags, clicks and wheel go to the page.
  const V = { x: innerWidth / 2, y: innerHeight / 2, down: null, range: null, on: false, fresh: false };
  const vc = document.createElement("div"); vc.id = "vcursor"; vc.hidden = true;
  const vcCss = document.createElement("style");
  vcCss.textContent = `#vcursor{position:fixed;left:0;top:0;width:18px;height:22px;pointer-events:none;z-index:2147483647;
    background:url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 11" shape-rendering="crispEdges"><path d="M0 0h1v1h1v1h1v1h1v1h1v1h1v1h1v1h-3v1h1v2h-1v1h-1v-2h-1v1h-1v1h-1z" fill="#050508"/><path d="M1 2h1v1h1v1h1v1h1v1h1v1h-3v1h1v2h-1v-2h-1v1h-1z" fill="#d8cbb4"/></svg>')}") 0 0/100% 100% no-repeat;image-rendering:pixelated}
    #vcursor.hot{filter:sepia(1) saturate(4) hue-rotate(-10deg)}`;
  document.head.appendChild(vcCss); document.body.appendChild(vc);
  const cursorMode = () => locked() && !!document.querySelector(NEEDS_CURSOR);
  const at = () => document.elementFromPoint(V.x, V.y) || document.body;
  function send(type, el) {
    const Ev = type.startsWith("pointer") ? PointerEvent : type === "wheel" ? WheelEvent : MouseEvent;
    el.dispatchEvent(new Ev(type, { bubbles: true, cancelable: true, composed: true, view: window, clientX: V.x, clientY: V.y,
      screenX: V.x, screenY: V.y, button: 0, buttons: V.down ? 1 : 0, pointerId: 1, pointerType: "mouse", isPrimary: true }));
  }
  function slide(r) { // native range inputs can't be dragged by synthetic events: set them from x
    const b = r.getBoundingClientRect(), min = +r.min || 0, max = r.max === "" ? 100 : +r.max, step = +r.step || 1;
    const v = min + Math.round(Math.max(0, Math.min(1, (V.x - b.left) / b.width)) * (max - min) / step) * step;
    if (+r.value !== v) { r.value = v; r.dispatchEvent(new Event("input", { bubbles: true })); r.dispatchEvent(new Event("change", { bubbles: true })); }
  }
  function place() {
    vc.style.transform = `translate(${V.x}px,${V.y}px)`;
    const el = document.elementFromPoint(V.x, V.y);
    vc.classList.toggle("hot", !!el && getComputedStyle(el).cursor === "pointer");
  }
  function steer(dx, dy) {
    V.x = Math.max(0, Math.min(innerWidth - 1, V.x + dx)); V.y = Math.max(0, Math.min(innerHeight - 1, V.y + dy));
    place();
    const el = V.down ? V.down.el : at();
    send("pointermove", el); send("mousemove", el);
    if (V.range) slide(V.range);
  }
  // pages written for a real mouse call setPointerCapture, which throws while the pointer is locked
  const cap = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = function (id) { if (document.pointerLockElement) return; return cap.call(this, id); };
  // (a cancelled pointerdown would also cancel the mousemoves of the drag that follows, so that one is only stopped)
  const swallow = (e) => { if (!e.isTrusted || !cursorMode()) return false; e.stopImmediatePropagation(); if (e.type !== "pointerdown") e.preventDefault(); return true; };
  window.addEventListener("pointerdown", (e) => {
    if (!swallow(e)) return;
    const el = at();
    if (el.tagName === "IFRAME") { autoExit = true; document.exitPointerLock(); return; } // another page: give it the real mouse
    V.down = { el };
    send("pointerdown", el); send("mousedown", el);
    const f = el.closest("input,textarea,select,[contenteditable]");
    if (f) f.focus(); else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (el.matches("input[type=range]")) { V.range = el; slide(el); }
  }, true);
  window.addEventListener("pointerup", (e) => {
    if (!swallow(e)) return;
    const el = at(), d = V.down && V.down.el;
    if (d) { send("pointerup", d); send("mouseup", d); }
    V.down = null; V.range = null;
    if (d && (d === el || d.contains(el))) send("click", el); else if (d && el.contains(d)) send("click", d);
  }, true);
  for (const t of ["mousedown", "mouseup", "click", "dblclick", "contextmenu"]) window.addEventListener(t, swallow, true);
  window.addEventListener("wheel", (e) => {
    if (!swallow(e)) return;
    for (let el = at(); el; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if (el.scrollHeight > el.clientHeight + 1 && (oy === "auto" || oy === "scroll")) { el.scrollBy(0, e.deltaY); return; }
    }
    document.scrollingElement.scrollBy(0, e.deltaY);
  }, { capture: true, passive: false });
  function cursorFrame() {
    const on = cursorMode();
    if (on && !V.on) { if (!V.fresh) { V.x = innerWidth / 2; V.y = innerHeight / 2; } place(); } // a panel opened mid-walk: start centred
    if (!locked()) V.fresh = false; else if (!on) V.fresh = false;
    if (!on && V.down) { V.down = null; V.range = null; }
    V.on = on; vc.hidden = !on;
  }

  const reticle = document.getElementById("reticle");

  function blocked(x, z) {
    for (const c of colliders) if (x > c.x0 - 0.22 && x < c.x1 + 0.22 && z > c.z0 - 0.22 && z < c.z1 + 0.22) return true;
    return false;
  }
  const ray = new THREE.Raycaster(); ray.far = 3.2;
  function pickUsable() {
    ray.setFromCamera(fine && !locked() && mouse ? mouse : { x: 0, y: 0 }, camera);
    let best = null, bd = 99;
    for (const u of usables) {
      if (u.enabled === false) continue;
      const h = ray.intersectObject(u.obj, true)[0];
      if (h && h.distance < (u.range || 3.0) && h.distance < bd) { best = u; bd = h.distance; }
    }
    if (best !== hover) { hover = best; onHover.forEach((f) => f(hover)); }
  }

  const tickers = [], afters = [];
  let ground = null;     // (x, z) => floor height, for stairs; null = flat
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!P.frozen) {
      let f = 0, s = 0;
      if (keys.has("f")) f += 1; if (keys.has("b")) f -= 1;
      if (keys.has("l")) s -= 1; if (keys.has("r")) s += 1;
      if (keys.has("tl")) P.yaw += 1.9 * dt; if (keys.has("tr")) P.yaw -= 1.9 * dt;
      f += -stick.y; s += stick.x;
      const len = Math.hypot(f, s);
      if (len > 0.05) {
        const k = Math.min(1, len) / len * P.speed * dt;
        const dx = (-Math.sin(P.yaw) * f + Math.cos(P.yaw) * s) * k, dz = (-Math.cos(P.yaw) * f - Math.sin(P.yaw) * s) * k;
        if (!blocked(P.x + dx, P.z)) P.x += dx; if (!blocked(P.x, P.z + dz)) P.z += dz;
        P.bob += dt * 9;
      }
    }
    cursorFrame();
    tickers.forEach((t) => t(dt, now / 1000));
    swayAll(now / 1000);
    const sh = P.travel * 0.006 + P.shake; P.shake *= 0.9;
    P.y = ground ? ground(P.x, P.z) : 0;
    camera.position.set(P.x + (Math.random() - .5) * sh, P.y + P.eye + Math.sin(P.bob) * 0.025 + (Math.random() - .5) * sh, P.z);
    camera.rotation.set(P.pitch, P.yaw, 0);
    pickUsable();
    canvas.style.cursor = locked() ? "none" : hover ? "pointer" : "crosshair";
    if (reticle) { reticle.classList.toggle("on", (locked() && !V.on) || !fine); reticle.classList.toggle("hot", !!hover); }
    renderer.render(scene, camera);
    afters.forEach((f) => f(canvas));   // read the frame before the browser clears it
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    THREE, scene, camera, hemi, P, stick,
    setColliders(c) { colliders = c; },
    setUsables(u) { usables = u; hover = null; onHover.forEach((f) => f(null)); },
    onHover(f) { onHover.push(f); },
    tick(f) { tickers.push(f); return () => tickers.splice(tickers.indexOf(f), 1); },
    afterRender(f) { afters.push(f); return () => afters.splice(afters.indexOf(f), 1); },
    setGround(f) { ground = f; },
    atmosphere(color, density, hemiI) {
      scene.fog.color.set(color); scene.background = new THREE.Color(color); scene.fog.density = density; hemi.intensity = hemiI;
    },
    inCar() { return Math.abs(P.x) < 1.0 && P.z > -1.0 && P.z < 1.0; },
    face(yaw, pitch = -0.04) { P.yaw = yaw; P.pitch = pitch; },
  };
}
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
