// The subject's head: a CRT-monitor robot head drawn on body.html's canvas. Its
// screen face is driven by the same state as everything else: pain sets the
// expression, head bruising cracks the glass and adds static, kind words soften
// it, falling things get watched, speech moves the mouth, and a death collapses
// the picture to a dot. Each generation in the lineage has its own phosphor.
// Uses body.html's globals: g, S, OX, OY, P, pain, bruise, dropped, hv.
"use strict";
(function () {
  const PHOS = [[120, 255, 150], [255, 190, 90], [225, 235, 255], [110, 220, 255], [255, 120, 120], [205, 160, 255], [175, 255, 95], [255, 235, 140]];
  const st = { blinkAt: performance.now() + 2500, talkUntil: 0, healAt: -1e9, offAt: -1e9, look: [0, 0] };
  const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const CRACKS = Array.from({ length: 7 }, (_, i) => {
    const pts = [[(rnd(i) - .5) * 44, (rnd(i + 9) - .5) * 32]];
    for (let j = 0; j < 4; j++) { const p = pts[pts.length - 1]; pts.push([p[0] + (rnd(i * 7 + j) - .5) * 20, p[1] + (rnd(i * 13 + j) - .5) * 15]); }
    return pts;
  });
  const gen = () => (window.VG && VG.gen ? VG.gen() : 1);
  const col = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function watched(h) {   // the nearest thing still falling toward it
    let best = null, bd = 1e9;
    for (const b of dropped) { if (b.velocity.y < .6 || b.position.y > h.position.y) continue;
      const d = Math.abs(b.position.x - h.position.x) + (h.position.y - b.position.y) * .3; if (d < bd) { bd = d; best = b.position; } }
    return best;
  }
  function neck(h) {        // a ribbed cable from the head down into the collar
    const c = P.chest, x0 = h.position.x, y0 = h.position.y + 22, x1 = c.position.x, y1 = c.position.y - 34;
    g.save(); g.lineCap = "round"; g.strokeStyle = "#1c1d1f"; g.lineWidth = 13 * S;
    g.beginPath(); g.moveTo(OX + x0 * S, OY + y0 * S); g.lineTo(OX + x1 * S, OY + y1 * S); g.stroke();
    g.strokeStyle = "#3a3d41"; g.lineWidth = 2 * S;
    for (let t = .12; t < 1; t += .17) { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      g.beginPath(); g.moveTo(OX + (x - 6) * S, OY + y * S); g.lineTo(OX + (x + 6) * S, OY + y * S); g.stroke(); }
    g.restore();
  }
  function face(now, ph, p, healed, talking, look) {
    g.lineCap = "square"; g.lineJoin = "miter"; g.strokeStyle = g.fillStyle = col(ph, .95); g.lineWidth = 2.6;
    g.shadowColor = col(ph, .9); g.shadowBlur = 6;
    const jit = p > 2.4 ? (Math.random() - .5) * 1.6 : 0, ex = 11, ey = -5 + jit, [lx, ly] = look;
    const blinking = now > st.blinkAt && now < st.blinkAt + 130;
    if (now > st.blinkAt + 130) st.blinkAt = now + 1800 + Math.random() * 4200 / (1 + p);
    for (const s of [-1, 1]) {
      const x = s * ex + lx, y = ey + ly;
      if (blinking) { g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.stroke(); continue; }
      if (healed) { g.beginPath(); g.moveTo(x - 4, y + 2); g.lineTo(x, y - 2); g.lineTo(x + 4, y + 2); g.stroke(); }          // ^ ^
      else if (p > 2.4) { g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke(); }  // X X
      else if (p > 1.2) { g.beginPath(); g.moveTo(x - s * 4, y - 4); g.lineTo(x + s * 3, y); g.lineTo(x - s * 4, y + 4); g.stroke(); }                // > <
      else { g.fillRect(x - 3, y - 3, 6, 6);
        if (p > .3) { g.beginPath(); g.moveTo(x - 5, y - 8 - s * 2); g.lineTo(x + 5, y - 8 + s * 2); g.stroke(); } }              // worried brows
    }
    const my = 9 + jit;
    g.beginPath();
    if (talking) { const o = 2 + Math.abs(Math.sin(now / 65)) * 5 * (p > 2.4 ? 1.4 : 1); g.strokeRect(-6, my - o / 2, 12, o); return; }
    if (healed) { g.moveTo(-8, my - 1); g.quadraticCurveTo(0, my + 6, 8, my - 1); }
    else if (p > 2.4) { g.moveTo(-9, my + 3); for (let i = -9; i <= 9; i += 3) g.lineTo(i, my + (i / 3 % 2 ? -3 : 3)); g.lineTo(9, my + 3); g.closePath(); }
    else if (p > 1.2) { g.moveTo(-9, my); for (let i = -9; i <= 9; i += 3) g.lineTo(i, my + ((i / 3) % 2 ? 2 : -2)); }
    else if (p > .3) { g.moveTo(-7, my + 1); g.quadraticCurveTo(0, my - 3, 7, my + 1); }
    else { g.moveTo(-7, my); g.lineTo(7, my); }
    g.stroke();
  }

  window.RH = {
    talk(ms) { st.talkUntil = Math.max(st.talkUntil, performance.now() + (ms || 2000)); },
    heal() { st.healAt = performance.now(); },
    off() { st.offAt = performance.now(); },
    draw(h, now) {
      const ph = PHOS[(gen() - 1) % PHOS.length], dmg = Math.min(1, bruise.head || 0), p = pain;
      neck(h);
      g.save(); g.translate(OX + h.position.x * S, OY + h.position.y * S); g.rotate(h.angle); g.scale(S, S);
      // antenna, swaying against the head's motion; its LED says how it is
      const sway = Math.max(-.6, Math.min(.6, -(typeof hv === "number" ? hv : 0) * 2 + Math.sin(now / 900) * .08));
      const tx = Math.sin(sway) * 16, ty = -30 - Math.cos(sway) * 16;
      g.strokeStyle = "#2a2c2f"; g.lineWidth = 2.4; g.beginPath(); g.moveTo(0, -30); g.quadraticCurveTo(tx * .2, -40, tx, ty); g.stroke();
      const healed = now - st.healAt < 2600, led = healed ? [255, 210, 120] : p > 2 ? [255, 60, 50] : ph;
      const on = !(p > 2 && Math.floor(now / 220) % 2);
      g.fillStyle = col(led, on ? 1 : .25); g.shadowColor = col(led, 1); g.shadowBlur = on ? 10 : 0;
      g.beginPath(); g.arc(tx, ty, 3.2, 0, 7); g.fill(); g.shadowBlur = 0;
      // ear bolts and vents
      for (const s of [-1, 1]) { g.fillStyle = "#2b2d30"; g.fillRect(s > 0 ? 33 : -40, -9, 7, 18); g.fillStyle = "#7d8186"; g.beginPath(); g.arc(s * 37, 0, 2.2, 0, 7); g.fill(); }
      // housing: gunmetal, bevelled, riveted, dented where it's been hit
      const hg = g.createLinearGradient(-34, -30, 34, 30); hg.addColorStop(0, "#6c7075"); hg.addColorStop(.45, "#4a4e53"); hg.addColorStop(1, "#24272a");
      g.beginPath(); g.roundRect(-34, -30, 68, 58, 10); g.fillStyle = hg; g.fill(); g.lineWidth = 1.5; g.strokeStyle = "rgba(0,0,0,.6)"; g.stroke();
      g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth = 1; g.beginPath(); g.roundRect(-32, -28, 64, 54, 9); g.stroke();
      g.fillStyle = "#8a8e93"; for (const [x, y] of [[-29, -25], [29, -25], [-29, 23], [29, 23]]) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
      g.strokeStyle = "rgba(0,0,0,.5)"; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 7 - 2, -27); g.lineTo(i * 7 + 2, -27); g.stroke(); }
      for (let i = 0; i < Math.floor(dmg * 6); i++) { g.fillStyle = "rgba(10,8,8,.35)"; g.beginPath(); g.ellipse((rnd(i + 40) - .5) * 56, (rnd(i + 50) - .5) * 46, 4 + rnd(i) * 4, 2.5 + rnd(i + 3) * 2, rnd(i + 5) * 3, 0, 7); g.fill(); }
      // the screen
      g.save(); g.beginPath(); g.roundRect(-26, -22, 52, 41, 7); g.clip();
      g.fillStyle = "#040706"; g.fillRect(-26, -22, 52, 41);
      const glow = g.createRadialGradient(0, -2, 2, 0, -2, 34); glow.addColorStop(0, col(ph, .18)); glow.addColorStop(1, col(ph, 0)); g.fillStyle = glow; g.fillRect(-26, -22, 52, 41);
      const off = (now - st.offAt) / 1000;
      if (off < 1.4) {            // CRT power-off: the picture folds to a line, then a dot, then comes back as the next one
        const t = Math.min(1, off / .5); g.fillStyle = col(ph, off < 1 ? 1 : 0);
        if (t < 1) g.fillRect(-26 * (1 - t * .2), -20 * (1 - t) - 1, 52 * (1 - t * .2), 40 * (1 - t) + 2);
        else { g.beginPath(); g.arc(0, 0, Math.max(0, 3 * (1 - (off - .5) * 2)), 0, 7); g.fill(); }
      } else {
        const look = watched(h); let lx = 0, ly = 0;
        if (look) { lx = Math.max(-3, Math.min(3, (look.x - h.position.x) / 30)); ly = -2.5; }
        st.look[0] += (lx - st.look[0]) * .2; st.look[1] += (ly - st.look[1]) * .2;
        const gl = Math.min(1, p / 4 * .6 + dmg * .7);
        if (Math.random() < gl * .35) g.translate((Math.random() - .5) * 4 * gl, 0);
        face(now, ph, p, healed && p < 2, now < st.talkUntil, st.look);
        g.shadowBlur = 0;
        for (let i = 0; i < gl * 40; i++) { g.fillStyle = col(ph, Math.random() * .5); g.fillRect((Math.random() - .5) * 52, (Math.random() - .5) * 41 - 2, 1.2, 1.2); }
        if (Math.random() < gl * .25) { const y = (Math.random() - .5) * 36; g.fillStyle = col(ph, .25); g.fillRect(-26, y, 52, 1.5 + Math.random() * 3); }
      }
      g.fillStyle = "rgba(0,0,0,.28)"; for (let y = -22; y < 19; y += 2) g.fillRect(-26, y, 52, .8);              // scanlines
      const gls = g.createLinearGradient(-26, -22, 10, 19); gls.addColorStop(0, "rgba(255,255,255,.10)"); gls.addColorStop(.4, "rgba(255,255,255,0)"); g.fillStyle = gls; g.fillRect(-26, -22, 52, 41);
      g.strokeStyle = "rgba(235,245,240,.55)"; g.lineWidth = .8;                                                  // cracked glass
      for (let i = 0; i < Math.min(CRACKS.length, Math.floor(dmg * 8)); i++) { g.beginPath(); CRACKS[i].forEach(([x, y], j) => g[j ? "lineTo" : "moveTo"](x, y)); g.stroke(); }
      const vg = g.createRadialGradient(0, -2, 14, 0, -2, 36); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.55)"); g.fillStyle = vg; g.fillRect(-26, -22, 52, 41);
      g.restore();
      g.lineWidth = 2; g.strokeStyle = "#17191b"; g.beginPath(); g.roundRect(-26, -22, 52, 41, 7); g.stroke();   // bezel
      g.restore();
    },
  };
})();
