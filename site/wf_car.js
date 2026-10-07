// Wrong Floor — the car. Sits at the origin, doors facing -z, set into a wall
// whose far side each floor dresses. One button inside: close doors.
import { THREE, lambert, basic, box, plane, noiseTex, canvasTex, figure, burstFigure } from "./wf_engine.js";

export const W = 2.2, H = 2.6, D = 2.2, DOOR_W = 1.2, DOOR_H = 2.1;

export function createCar(E) {
  const g = new THREE.Group(); E.scene.add(g);
  const metal = noiseTex(64, 64, 150, 40, 4, 7, undefined, (c, w) => { c.fillStyle = "rgba(255,255,255,.08)"; c.fillRect(0, 20, w, 10); });
  metal.repeat.set(2, 2);
  const wallM = lambert({ map: metal });
  plane(g, W, H, wallM, 0, H / 2, D / 2, 0, Math.PI);
  plane(g, D, H, wallM, -W / 2, H / 2, 0, 0, Math.PI / 2);
  plane(g, D, H, wallM, W / 2, H / 2, 0, 0, -Math.PI / 2);
  const side = (W - DOOR_W) / 2;
  [-1, 1].forEach((s) => plane(g, side, H, wallM, s * (DOOR_W / 2 + side / 2), H / 2, -D / 2));
  plane(g, DOOR_W, H - DOOR_H, wallM, 0, DOOR_H + (H - DOOR_H) / 2, -D / 2);
  const fl = noiseTex(64, 64, 60, 30, 8, 11, undefined, (c, w, h) => { c.strokeStyle = "rgba(0,0,0,.4)"; for (let i = 0; i <= w; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.moveTo(0, i); c.lineTo(w, i); c.stroke(); } });
  fl.repeat.set(2, 2);
  plane(g, W, D, lambert({ map: fl }), 0, 0.001, 0, -Math.PI / 2);
  plane(g, W, D, lambert({ color: 0x9aa39f }), 0, H, 0, Math.PI / 2);
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.22, 8), new THREE.MeshBasicMaterial({ color: 0xf1efe6 }));
  lamp.rotation.x = Math.PI / 2; lamp.position.set(0, H - 0.01, 0.2); g.add(lamp);
  const light = new THREE.PointLight(0xe9efe9, 2.2, 5, 1.4); light.position.set(0, H - 0.3, 0.2); g.add(light);
  [-1, 1].forEach((s) => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, D * 0.8, 6), lambert({ color: 0x777f7b })); r.rotation.x = Math.PI / 2; r.position.set(s * (W / 2 - 0.07), 0.95, 0); g.add(r); });

  // doors (two leaves) and the wall the car is set into, seen from the floor
  const doorM = lambert({ map: noiseTex(32, 64, 140, 26, 2, 3, undefined, (c, w, h) => { c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(w - 2, 0, 2, h); }) });
  const doors = [-1, 1].map((s) => { const d = box(g, DOOR_W / 2, DOOR_H, 0.04, doorM, s * DOOR_W / 4, DOOR_H / 2, -D / 2 - 0.03); d.userData.s = s; return d; });
  const outerM = lambert({ color: 0x6a6660 });
  const outer = new THREE.Group(); g.add(outer);
  box(outer, 7, 4.2, 0.12, outerM, -(DOOR_W / 2 + 3.5), 2.1, -D / 2 - 0.1);
  box(outer, 7, 4.2, 0.12, outerM, (DOOR_W / 2 + 3.5), 2.1, -D / 2 - 0.1);
  box(outer, DOOR_W, 4.2 - DOOR_H, 0.12, outerM, 0, DOOR_H + (4.2 - DOOR_H) / 2, -D / 2 - 0.1);

  // panel + indicators
  const panelTex = canvasTex(32, 64, (c, w, h) => {
    c.fillStyle = "#a5aaa6"; c.fillRect(0, 0, w, h); c.fillStyle = "#0a0f0a"; c.fillRect(5, 5, 22, 9);
    c.fillStyle = "#2b2b2b"; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(16, 24 + i * 9, 3, 0, 7); c.fill(); }
    c.fillStyle = "#c0392b"; c.beginPath(); c.arc(16, 54, 4, 0, 7); c.fill();
  });
  const panel = plane(g, 0.26, 0.52, lambert({ map: panelTex, emissive: 0x151515 }), W / 2 - 0.006, 1.25, -0.62, 0, -Math.PI / 2);
  const indTex = canvasTex(64, 24, () => {}); const outTex = canvasTex(64, 24, () => {});
  plane(g, 0.42, 0.16, new THREE.MeshBasicMaterial({ map: indTex }), 0, DOOR_H + 0.25, -D / 2 + 0.01);
  plane(g, 0.42, 0.16, new THREE.MeshBasicMaterial({ map: outTex }), 0, DOOR_H + 0.3, -D / 2 - 0.17, 0, Math.PI);
  function label(text, color = "#d24a2a") {
    [indTex, outTex].forEach((t) => { const c = t.userData.canvas.getContext("2d"); c.fillStyle = "#050805"; c.fillRect(0, 0, 64, 24);
      c.fillStyle = color; c.font = "bold 18px monospace"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, 32, 13); t.needsUpdate = true; });
  }
  const rider = burstFigure(1.75); rider.position.set(0.05, 0, D / 2 - 0.2); rider.rotation.y = Math.PI; rider.visible = false; g.add(rider);

  const S = { door: 0, target: 0, flash: 0 };
  E.tick((dt, t) => {
    S.door += (S.target - S.door) * Math.min(1, dt * 1.6);
    doors.forEach((d) => { d.position.x = d.userData.s * (DOOR_W / 4 + S.door * DOOR_W / 2 * 0.98); });
    light.intensity = 2.2 * (E.P.travel ? 0.85 + 0.15 * Math.sin(t * 40) : 1) * (1 - S.flash);
  });

  const walls = [
    { x0: -W / 2 - 0.1, x1: -W / 2, z0: -D / 2, z1: D / 2 }, { x0: W / 2, x1: W / 2 + 0.1, z0: -D / 2, z1: D / 2 },
    { x0: -W / 2, x1: W / 2, z0: D / 2, z1: D / 2 + 0.1 },
    { x0: -W / 2 - 7, x1: -DOOR_W / 2, z0: -D / 2 - 0.16, z1: -D / 2 },
    { x0: DOOR_W / 2, x1: W / 2 + 7, z0: -D / 2 - 0.16, z1: -D / 2 },
  ];
  const doorWall = { x0: -DOOR_W / 2, x1: DOOR_W / 2, z0: -D / 2 - 0.16, z1: -D / 2 };
  return {
    group: g, panel, rider, label, outerM,
    colliders() { return S.target > 0.5 && S.door > 0.6 ? walls : walls.concat([doorWall]); },
    open() { S.target = 1; return new Promise((r) => setTimeout(r, 2400)); },
    close() { S.target = 0; return new Promise((r) => setTimeout(r, 2400)); },
    isOpen() { return S.target > 0.5; },
    flash(v) { S.flash = v; },
  };
}
