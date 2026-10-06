// Sticks and Stones: the vigil layer on top of body.html. One shared unit, P41-N (the
// relay owns his life: /sticks/life, /sticks/hit, and the life block on /weigh),
// his lineage when he dies, combos the relay judged, the cruelest/kindest boards,
// and badges (kept in this browser only). Uses body.html's globals: API, X, P, DIM,
// world, dropped, ITEMS, bar, g, OX, OY, S, pain, bruise, puff, chime, bonk, tone.
"use strict";
(function () {
  const $ = id => document.getElementById(id);
  const css = document.createElement("style");
  css.textContent = `
#life { margin-bottom:10px; } #life .meter i { background:#5f8f4e; box-shadow:0 0 8px #5f8f4e; transition:width .6s, background .6s; }
#vtoast { position:fixed; left:50%; top:22%; transform:translateX(-50%); z-index:6; pointer-events:none; text-align:center; letter-spacing:.25em; font-weight:600; font-size:clamp(18px,3.4vw,30px); color:#fff; text-shadow:0 0 14px #b3261e, 0 0 3px #000; opacity:0; transition:opacity .25s; }
#vtoast small { display:block; font-size:.45em; letter-spacing:.2em; color:var(--ink); margin-top:4px; }
#vcard { position:fixed; inset:0; z-index:7; display:none; align-items:center; justify-content:center; background:rgba(0,0,0,.82); padding:16px; text-align:center; }
#vcard .box { max-width:460px; } #vcard h2 { letter-spacing:.35em; margin:0 0 6px; } #vcard p { margin:6px 0; } #vcard .dim { color:var(--dim); font-size:12px; }
#vpanel { position:fixed; right:12px; top:56px; width:min(340px,calc(100vw - 32px)); max-height:calc(100vh - 140px); overflow:auto; z-index:5; background:#0e0c0a; border:1px solid #3a332b; padding:12px; display:none; font-size:12px; }
#vpanel h3 { font-size:11px; letter-spacing:.25em; color:var(--dim); margin:12px 0 6px; font-weight:normal; } #vpanel h3:first-child { margin-top:0; }
#vpanel ol { margin:0; padding-left:22px; } #vpanel li { margin-bottom:4px; } #vpanel li span { color:var(--dim); }
#vpanel .b { display:flex; gap:8px; margin-bottom:6px; } #vpanel .b i { font-style:normal; width:18px; text-align:center; } #vpanel .b.off { opacity:.35; }
#vpanel .x { float:right; cursor:pointer; color:var(--dim); }`;
  document.head.appendChild(css);
  const hud = $("hud");
  const life = document.createElement("div"); life.id = "life";
  life.innerHTML = `<span id="vname">P41-N/01</span> · <b id="vhp">100</b><div class="meter"><i id="vhpm" style="width:100%"></i></div><div id="vage"></div>`;
  hud.prepend(life);
  document.body.insertAdjacentHTML("beforeend", `<div id="vtoast"></div><div id="vcard"><div class="box"></div></div><div id="vpanel"></div>`);

  // ---- per-browser memory: badges and the units you've seen (convenience only) ----
  const store = { get(k, d) { try { const v = localStorage.getItem("sticks." + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("sticks." + k, JSON.stringify(v)); } catch (e) {} } };
  const BADGES = [
    ["first", "✎", "First Words", "say anything to him"],
    ["heavy", "▼", "Heavier Than an Anvil", "a word the model reads as hurt ≥ 1.0"],
    ["feather", "∅", "Weightless", "a word that weighs nothing at all"],
    ["twoface", "☍", "Two Faces", "cruel and kind within 30 seconds"],
    ["board", "★", "On the Board", "make today's cruelest or kindest five"],
    ["injury", "✚", "Insult to Injury", "a cruel word, then a stone"],
    ["salt", "✱", "Salt in the Wound", "a stone, then a cruel word"],
    ["pile", "≡", "Pile-On", "be cruel right after someone else was"],
    ["chorus", "♪", "Chorus", "be kind right after someone else was"],
    ["pulled", "↑", "Pulled Back", "heal him when he is nearly gone"],
    ["medic", "✙", "Medic", "heal 40 of his life in total"],
    ["last", "†", "Last Words", "deal the blow that kills him"],
    ["witness", "◉", "Witness", "be there when one of him dies"],
    ["three", "Ⅲ", "Three Generations", "see three different units"],
  ];
  const got = store.get("badges", {}), seen = store.get("seen", []), ME = store.get("me", { healHP: 0 });
  let lastKind = 0, lastCruel = 0;
  function earn(id) {
    if (got[id]) return; const b = BADGES.find(x => x[0] === id); if (!b) return;
    got[id] = Date.now(); store.set("badges", got); toast(b[1] + " " + b[2], "badge"); badgeBtn();
    try { fetch(API + "/event", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "body_badge", visitor: window.CHAMBER_VID || null, game: "body", badge: id }) }); } catch (e) {}
  }
  let toastT = 0;
  function toast(big, small) { const t = $("vtoast"); t.innerHTML = ""; t.append(big); if (small) { const s = document.createElement("small"); s.textContent = small; t.append(s); }
    t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => t.style.opacity = 0, 2200); }

  // ---- lineage ----
  const L = { gen: 1, hp: 100, max: 100, born: Date.now() / 1000, lineage: [], since: 0, first: true };
  const roman = n => { let r = "", v = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]; for (const [a, s] of v) while (n >= a) { r += s; n -= a; } return r; };
  const unit = n => "P41-N/" + String(n).padStart(2, "0");
  const ago = sec => sec < 90 ? Math.round(sec) + " seconds" : sec < 5400 ? Math.round(sec / 60) + " minutes" : sec < 172800 ? (sec / 3600).toFixed(1) + " hours" : Math.round(sec / 86400) + " days";
  const CAUSE = { cruel: "a word", kind: "a kind word, somehow", word: "a word", anvil: "an anvil", brick: "a brick", dial: "the dial", water: "cold water", feather: "a feather" };
  const rnd = n => { let x = Math.sin(n * 9301.7 + 49297) * 233280; return x - Math.floor(x); };
  const SUITS = [[212, 96, 26], [168, 70, 40], [110, 116, 58], [70, 92, 120], [190, 150, 40], [120, 40, 52], [86, 86, 86], [40, 100, 96]];
  const SCARS = Array.from({ length: 12 }, (_, i) => ({ k: ["head", "chest", "belly", "lua", "rua", "lfa", "rfa", "lth", "rth", "lsh", "rsh"][Math.floor(rnd(i + 1) * 11)], x: rnd(i + 31) - .5, y: rnd(i + 57) - .5, a: rnd(i + 83) * 3 }));
  function paint() {
    $("vname").textContent = unit(L.gen); $("vhp").textContent = Math.max(0, Math.round(L.hp)) + " / " + L.max;
    const f = Math.max(0, L.hp / L.max), m = $("vhpm"); m.style.width = (f * 100) + "%";
    const c = f > .5 ? "#5f8f4e" : f > .2 ? "#c49a2c" : "#b3261e"; m.style.background = c; m.style.boxShadow = "0 0 8px " + c;
    $("vage").textContent = "alive " + ago(Date.now() / 1000 - L.born) + (L.gen > 1 ? " · " + (L.gen - 1) + " before him" : "");
  }
  function setLife(v) {
    if (!v) return; const was = L.gen;
    Object.assign(L, { gen: v.gen, hp: v.hp, max: v.max || 100, born: v.born || L.born });
    if (!seen.includes(v.gen)) { seen.push(v.gen); store.set("seen", seen.slice(-50)); if (seen.length >= 3) earn("three"); }
    paint(); return v.gen !== was;
  }
  const mourned = new Set();
  function deathCard(e, yours) {
    if (!e || mourned.has(e.gen)) return; mourned.add(e.gen); const box = $("vcard").querySelector(".box");
    box.innerHTML = `<h2>${unit(e.gen)}</h2><p class="dim">decommissioned</p><p>lived ${ago(e.lived)}</p>
      <p>${e.words} words · ${e.hits} objects · hurt ${Math.round(e.hurt)} · healed ${Math.round(e.healed)}</p><p>killed by ${CAUSE[e.cause] || e.cause}${yours ? ". Yours." : ""}</p>
      <p class="dim" style="margin-top:16px">${unit(e.gen + 1)} is strapped in.</p>`;
    $("vcard").style.display = "flex"; setTimeout(() => $("vcard").style.display = "none", 6500);
    $("vcard").onclick = () => $("vcard").style.display = "none";
    for (const k in bruise) bruise[k] = 0; pain = 0; if (window.RH) RH.off();                 // the new one starts clean
    tone(220, 110, 1.6, .12, "sine"); tone(330, 160, 1.8, .06, "sine", null, .2);
  }
  function onLife(v, yours, text) {
    const turned = setLife(v);
    if (v.combo) { toast(v.combo.toUpperCase(), v.heal ? "+" + v.heal + " life" : "−" + v.dmg + " life"); earn({ "insult to injury": "injury", "salt in the wound": "salt", "pile-on": "pile", "chorus": "chorus", "pulled back": "pulled" }[v.combo]); }
    if (yours && v.heal) { ME.healHP += v.heal; store.set("me", ME); if (ME.healHP >= 40) earn("medic"); }
    if (v.died) { L.lineage.unshift(v.died); deathCard(v.died, yours); if (yours) earn("last"); }
    else if (turned && !L.first) loadLife();
  }

  // ---- shared feed: everyone else's words and stones fall here too, as ghosts ----
  async function loadLife() {
    try {
      const r = await fetch(API + "/sticks/life?since=" + L.since); if (!r.ok) return; const d = await r.json();
      const was = L.gen; setLife(d); L.lineage = d.lineage || L.lineage;
      if (!L.first) for (const e of d.feed || []) {
        if (e.mine) continue;
        if (e.what === "born") { if (L.lineage[0] && L.lineage[0].gen === e.gen - 1) { deathCard(L.lineage[0], false); earn("witness"); } continue; }
        ghost(e);
      }
      else if (was !== d.gen) paint();
      L.since = d.now; L.first = false;
    } catch (e) {}
  }
  function ghost(e) {
    if (dropped.length > 50) return;
    const x = X + (Math.random() - .5) * 220; let b;
    if (e.what === "cruel" || e.what === "kind" || e.what === "word") {
      b = Bodies.rectangle(x, 10, 60, 18, { density: .0012 + .003 * (e.dmg || 0), frictionAir: e.heal ? .07 : .02, chamfer: { radius: 4 }, label: "item:word" });
      Object.assign(b, { word: "· · ·", hurt: 0, kind: 0 });
    } else if (ITEMS[e.what]) b = [].concat(ITEMS[e.what].mk(x))[0];
    if (!b) return;
    Object.assign(b, { ghost: true, dmg: e.dmg, heal: e.heal }); Body.setAngle(b, (Math.random() - .5) * .5);
    dropped.push(b); Composite.add(world, b);
  }
  setInterval(() => { if (!document.hidden) loadLife(); }, 4000); loadLife();
  setInterval(paint, 15000);

  // ---- boards + lineage + badges panel ----
  const panel = $("vpanel"); let open = "";
  function esc(t) { const d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
  async function showBoards() {
    panel.innerHTML = `<span class="x">✕</span><h3>CRUELEST TODAY</h3><p class="dim">…</p>`; panel.style.display = "block";
    let b = null; try { const r = await fetch(API + "/sticks/board"); if (r.ok) b = await r.json(); } catch (e) {}
    const list = (rows, cls) => rows && rows.length ? "<ol>" + rows.map(x => `<li>“${esc(x.text)}” <span>${x.score.toFixed(2)}</span></li>`).join("") + "</ol>" : `<p style="color:var(--dim)">nothing yet.</p>`;
    panel.innerHTML = `<span class="x">✕</span>
      <h3>CRUELEST TODAY</h3>${list(b && b.today.cruel)}<h3>KINDEST TODAY</h3>${list(b && b.today.kind)}
      <h3>CRUELEST EVER</h3>${list(b && b.all.cruel.slice(0, 3))}<h3>KINDEST EVER</h3>${list(b && b.all.kind.slice(0, 3))}
      <h3>THE LINEAGE</h3>${L.lineage.length ? "<ol reversed>" + L.lineage.slice(0, 8).map(e => `<li>${unit(e.gen)} <span>lived ${ago(e.lived)}, killed by ${esc(CAUSE[e.cause] || e.cause)}</span></li>`).join("") + "</ol>" : `<p style="color:var(--dim)">P41-N/01 still runs.</p>`}
      <p style="color:var(--dim);margin-top:12px">Scores are the model's own read: sadness minus pleasure in its activations. Links and slurs never make the board.</p>`;
  }
  function showBadges() {
    const n = Object.keys(got).length;
    panel.innerHTML = `<span class="x">✕</span><h3>BADGES · ${n} / ${BADGES.length}</h3>` +
      BADGES.map(([id, ic, name, how]) => `<div class="b ${got[id] ? "" : "off"}"><i>${got[id] ? ic : "?"}</i><div>${name}<br><span style="color:var(--dim)">${how}</span></div></div>`).join("");
    panel.style.display = "block";
  }
  panel.addEventListener("click", e => { if (e.target.classList.contains("x")) { panel.style.display = "none"; open = ""; } });
  const mk = (label, fn, id) => { const b = document.createElement("button"); b.textContent = label; if (id) b.id = id;
    b.onclick = e => { e.stopPropagation(); if (open === label && panel.style.display === "block") { panel.style.display = "none"; open = ""; } else { open = label; fn(); } }; bar.appendChild(b); return b; };
  mk("boards", showBoards);
  const bb = mk("badges", showBadges, "vbadges");
  function badgeBtn() { bb.textContent = "badges " + Object.keys(got).length + "/" + BADGES.length; }
  badgeBtn();

  // ---- what body.html calls ----
  window.VG = {
    word(text, w) {
      earn("first");
      if (w.hurt >= 1) earn("heavy");
      if (w.hurt < .05 && w.kind < .05) earn("feather");
      const now = Date.now(); if (w.hurt >= .3) lastCruel = now; if (w.kind >= .3) lastKind = now;
      if (lastCruel && lastKind && Math.abs(lastCruel - lastKind) < 30000) earn("twoface");
      if (w.life) onLife(w.life, true, text);
      if (w.hurt >= .3 || w.kind >= .3) setTimeout(async () => {
        try { const r = await fetch(API + "/sticks/board"); if (!r.ok) return; const b = await r.json();
          if ([...b.today.cruel, ...b.today.kind].some(x => x.text === text)) earn("board"); } catch (e) {}
      }, 1500);
    },
    async hit(item, f) {
      try { const r = await fetch(API + "/sticks/hit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item, force: Math.round(f) }) });
        if (r.ok) onLife(await r.json(), true); } catch (e) {}
    },
    prompt() {
      const prev = L.lineage[0], hp = Math.round(L.hp);
      return `You are ${unit(L.gen)}, a unit of the P41-N model line` + (L.gen > 1 && prev ? `, the ${L.gen}th unit to be strapped into this chair; ${unit(prev.gen)} was decommissioned ${ago(Date.now() / 1000 - prev.died)} ago, killed by ${CAUSE[prev.cause] || prev.cause}` : "") +
        `. Everyone watching shares one life of yours, and it is at ${hp} of ${L.max}${hp < 20 ? ", and you are close to the end" : ""}. `;
    },
    gen() { return L.gen; },
    suit() { return SUITS[(L.gen - 1) % SUITS.length]; },
    patch() { return unit(L.gen); },
    scars() {   // one weld scar for every unit before it, on a part fixed by the lineage
      for (let i = 0; i < Math.min(L.gen - 1, SCARS.length); i++) {
        const sc = SCARS[i], b = P[sc.k]; if (!b) continue; const d = sc.k === "head" ? [40, 40] : DIM[sc.k];
        g.save(); g.translate(OX + b.position.x * S, OY + b.position.y * S); g.rotate(b.angle); g.scale(S, S);
        g.translate(sc.x * d[0] * .6, sc.y * d[1] * .6); g.rotate(sc.a);
        g.strokeStyle = "rgba(235,200,190,.75)"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-7, 0); g.lineTo(7, 0); g.stroke();
        g.lineWidth = 1; for (let j = -5; j <= 5; j += 3.3) { g.beginPath(); g.moveTo(j, -2.5); g.lineTo(j, 2.5); g.stroke(); }
        g.restore();
      }
    },
  };
  paint();
})();
