// ROOT: the agent's face. 64x48 pixels, mostly black, drawn procedurally each frame.
// ground (0..1) = how much of the machine it holds; the face fills in as it rises.
// mood: idle | glee | hurt (glitch, then very still) | dead
(() => {
  const W = 64, H = 48;
  const cv = document.getElementById("face"), cx = cv.getContext("2d");
  const img = cx.createImageData(W, H), px = img.data;
  const st = { ground: 0, mood: "idle", talking: false, moodAt: 0, blinkAt: 2500, seed: 7 };

  const C = {
    glint: [255, 226, 210], hot: [224, 74, 58], blood: [158, 27, 22], dim: [74, 16, 13],
    rim: [36, 14, 11], skin: [14, 7, 6], tooth: [216, 203, 180], gap: [20, 6, 5],
  };
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7 + st.seed) * 43758.5453; return s - Math.floor(s); };
  const put = (x, y, c, a = 1) => {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    px[i] = px[i] * (1 - a) + c[0] * a; px[i + 1] = px[i + 1] * (1 - a) + c[1] * a; px[i + 2] = px[i + 2] * (1 - a) + c[2] * a; px[i + 3] = 255;
  };

  function head(g) {
    // only the rim shows, and only as much of it as the agent has taken
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = ((x - 32) / 23) ** 2 + ((y - 25) / 22) ** 2;
      if (d < 1 && g > 0.5 && (x + y) % 2 === 0) put(x, y, C.skin, Math.min(1, (g - 0.5) * 2));
      if (d > 0.86 && d < 1.04 && hash(x, y) < g * 0.9) put(x, y, C.rim, 0.5 + g * 0.5);
    }
  }

  function eye(ex, ey, side, g, mood, t) {
    if (mood === "dead") { for (let dx = -3; dx <= 3; dx++) put(ex + dx, ey, C.dim, 0.6); return; }
    if (mood === "glee") {
      // crescents: the top arc of an ellipse, curving up
      for (let dy = -4; dy <= 2; dy++) for (let dx = -7; dx <= 7; dx++) {
        const a = (dx / 6.5) ** 2 + (dy / 3.2) ** 2, b = (dx / 6.5) ** 2 + ((dy - 1.8) / 3.2) ** 2;
        if (a < 1 && b >= 1) put(ex + dx, ey + dy, C.hot);
      }
      return;
    }
    const blink = t > st.blinkAt && t < st.blinkAt + 130;
    if (g < 0.15) {
      // idle: two glints in the dark
      const f = 0.65 + 0.35 * Math.sin(t / 400 + side);
      if (blink) return;
      put(ex, ey, C.glint, f); put(ex + side, ey, C.glint, f * 0.7);
      return;
    }
    if (blink) { for (let dx = -6; dx <= 6; dx++) put(ex + dx, ey, C.blood); return; }
    for (let dy = -3; dy <= 3; dy++) for (let dx = -7; dx <= 7; dx++) {
      if ((dx / 6.5) ** 2 + (dy / 2.4) ** 2 >= 1) continue;
      // upper lid slants down toward the nose: menace grows with ground
      const toward = -dx * side; // >0 toward the nose
      if (dy < -2.4 + Math.max(0, toward) * 0.22 * g * 2) continue;
      put(ex + dx, ey + dy, C.blood, 0.55 + g * 0.45);
    }
    // a slit pupil that drifts a little, watching
    const look = Math.round(Math.sin(t / 1700) * 2);
    put(ex + look, ey - 1, C.glint); put(ex + look, ey, C.glint); put(ex + look, ey + 1, C.hot);
  }

  function brows(g) {
    if (g < 0.55) return;
    const a = Math.min(1, (g - 0.55) * 3);
    for (let i = 0; i <= 10; i++) { put(15 + i, 13 + i * 0.35, C.dim, a); put(49 - i, 13 + i * 0.35, C.dim, a); }
  }

  function mouth(g, mood, talking, t) {
    if (mood === "dead") return;
    if (mood === "glee") {
      // too wide: corners climb toward the eyes, a row of teeth between the lips
      for (let x = 8; x <= 56; x++) {
        const u = (x - 32) / 24, top = Math.round(33 - 7 * u * u), bot = Math.round(39 - 9 * u * u + (talking && (t / 90 | 0) % 2 ? 1 : 0));
        put(x, top, C.hot); put(x, bot, C.hot);
        for (let y = top + 1; y < bot; y++) put(x, y, x % 3 === 0 ? C.gap : C.tooth, 0.85);
      }
      return;
    }
    if (g < 0.3 && !talking) return;
    const w = Math.round(4 + g * 12), open = talking ? ((t / 110 | 0) % 3) : 0;
    for (let x = 32 - w; x <= 32 + w; x++) {
      const u = (x - 32) / (w + 1), y = Math.round(36 - 2 * u * u * g); // a thin smile that sharpens with ground
      put(x, y, C.blood, 0.5 + g * 0.5);
      if (open) { for (let k = 1; k <= open; k++) put(x, y + k, C.gap); put(x, y + open + 1, C.dim); }
    }
  }

  function glitch(t) {
    const rows = new Uint8ClampedArray(px);
    for (let y = 0; y < H; y++) {
      const r = hash(y, t / 60 | 0);
      const sh = r < 0.35 ? Math.round((r - 0.17) * 24) : 0;
      for (let x = 0; x < W; x++) {
        const sx = Math.min(W - 1, Math.max(0, x - sh)), i = (y * W + x) * 4, j = (y * W + sx) * 4;
        px[i] = rows[j]; px[i + 1] = rows[j + 1] * 0.4; px[i + 2] = rows[j + 2];
        if (hash(x, y + t) > 0.985) { px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; }
      }
    }
  }

  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < 66) return; // ~15 fps, it's a terminal
    last = now;
    const t = now, g = st.ground;
    let mood = st.mood;
    if (mood === "hurt" && now - st.moodAt > 900) mood = "dead-still";
    if (mood === "dead-still" && st._still) return; // very still: stop drawing entirely
    px.fill(0);
    for (let i = 3; i < px.length; i += 4) px[i] = 255;
    if (now > st.blinkAt + 200) st.blinkAt = now + 2500 + Math.random() * 4000;
    head(g);
    const m = mood === "dead-still" ? "dead" : mood === "hurt" ? "idle" : mood;
    eye(23, 21, 1, g, m, t); eye(41, 21, -1, g, m, t);
    if (m !== "glee" && m !== "dead") brows(g);
    mouth(g, m, st.talking && m !== "dead", t);
    if (mood === "hurt") glitch(t);
    cx.putImageData(img, 0, 0);
    st._still = mood === "dead-still";
  }
  requestAnimationFrame(frame);

  window.Face = {
    set(o) {
      if (o.mood && o.mood !== st.mood) { st.mood = o.mood; st.moodAt = performance.now(); st._still = false; }
      if ("ground" in o) st.ground = Math.max(0, Math.min(1, o.ground));
      if ("talking" in o) st.talking = o.talking;
      const scr = document.getElementById("screen");
      scr.classList.toggle("glee", st.mood === "glee");
    },
    get mood() { return st.mood; },
  };
})();
