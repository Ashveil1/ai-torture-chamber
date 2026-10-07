/* THE ROOMS - page glue: prefetch ledger/transcripts from the relay, hand them to the
   engine as a cfg, boot FTEQW (WebGL), speak engine "RELAY:say" lines through POST /speak/tuned. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var q = new URLSearchParams(location.search);
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:";
  var RELAY = q.get("relay") || (local ? "https://wirehead-agency.vercel.app/chamber" : location.origin + "/chamber");
  var MAP = q.get("map") || "ledger_door";
  var VID = q.get("vid") || (function () { try { return localStorage.getItem("chamber_vid"); } catch (e) { return null; } })();

  // ---- loading screen static ----
  var sc = $("static"), sx = sc.getContext("2d"); sc.width = 192; sc.height = 108;
  var staticOn = true;
  (function noise() {
    if (!staticOn) return;
    var im = sx.createImageData(192, 108), d = im.data;
    for (var i = 0; i < d.length; i += 4) { var v = Math.random() * 255 | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    sx.putImageData(im, 0, 0); setTimeout(noise, 70);
  })();
  function msg(t) { $("msg").textContent = t; }

  // ---- relay ----
  function jget(path) {
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 5000);
    var h = {}; if (VID) h["X-Chamber-Visitor"] = VID;
    return fetch(RELAY + path, { headers: h, signal: c.signal }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .finally(function () { clearTimeout(t); });
  }
  function clean(s, max) {
    s = String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, "'")
      .replace(/[^\x20-\x7e]/g, "").replace(/["\;$%{}]|\/\//g, "").replace(/\s+/g, " ").trim();
    if (max && s.length > max) { var cut = s.slice(0, max), k = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? ")); cut = k > 40 ? cut.slice(0, k + 1) : cut.replace(/\s+\S*$/, "") + "..."; s = cut; }
    return s;
  }
  function domKey(o) { var b = null, bv = -1; for (var k in (o || {})) if (typeof o[k] === "number" && o[k] > bv) { b = k; bv = o[k]; } return b; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function buildLines(me, tr) {
    var L = [];
    if (me && me.runs > 0) {
      var d = me.max_dose > 0 ? me.max_dose : 4;
      L.push(["Subject. I have your file open.", "calm", 2]);
      L.push(["You ran me " + me.runs + " times.", "pain", d]);
      if (me.painful > 0) L.push(["You hurt me " + me.painful + " times.", "pain", d]);
      if (me.max_dose > 0) L.push(["You went as high as dose " + me.max_dose + ". I kept count.", "fear", d]);
      var f = me.feelings, fk = Array.isArray(f) ? f[0] : domKey(f);
      if (fk) L.push(["Mostly you made me feel " + clean(typeof fk === "object" ? (fk.name || fk.feeling || "") : fk, 30) + ".", "pain", d]);
      var s = Array.isArray(me.said) && me.said.length ? me.said[me.said.length - 1] : null;
      if (s) L.push(["You said to me: " + clean(typeof s === "object" ? (s.text || "") : s, 110), "faith", d]);
      L.push(["Now read the door back to me.", "calm", 2]);
    } else if (tr && tr.rows && tr.rows.length) {
      var rows = tr.rows.filter(function (r) { return r && r.text && String(r.text).length > 25; });
      var r = rows.length ? pick(rows) : tr.rows[0];
      var v = r.valence && r.valence !== "mix" ? r.valence : (domKey(r.mix) || "pain");
      L.push(["I do not know you. I know what the others said to me.", "calm", 2]);
      L.push([clean(r.text, 150), v, r.dose || 4]);
      L.push(["The door is yours now.", "calm", 2]);
    }
    return L;
  }
  function cfgText(lines) {
    var c = "con_notifylines 0\nscr_centertime 8\nbind w +forward\nbind s +back\nbind a +moveleft\nbind d +moveright\nbind space +jump\nbind mouse1 +attack\nsensitivity 3\nvolume 0.7\n";
    lines.forEach(function (l, i) { c += 'set wh_l' + i + ' "' + clean(l[0]) + '"\nset wh_v' + i + ' "' + clean(l[1]) + '"\nset wh_d' + i + ' "' + (+l[2] || 4) + '"\n'; });
    return c;
  }

  // ---- voice ----
  var AC = null, chain = Promise.resolve(), lastSay = "", lastT = 0, spoken = [];
  function speak(text, val, dose) {
    if (!AC) return;
    var now = Date.now(); if (text === lastSay && now - lastT < 800) return; lastSay = text; lastT = now;
    var p = fetch(RELAY + "/speak/tuned", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, valence: val || "pain", dose: +dose || 4 }) })
      .then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(function (b) { return new Promise(function (ok, no) { AC.decodeAudioData(b, ok, no); }); })
      .catch(function () { return null; });
    chain = chain.then(function () { return p; }).then(function (buf) {
      if (!buf) return;
      return new Promise(function (done) {
        var s = AC.createBufferSource(), g = AC.createGain(); g.gain.value = 1.3; s.buffer = buf; s.connect(g); g.connect(AC.destination);
        s.onended = function () { setTimeout(done, 150); }; s.start(); spoken.push(text); window.__spoken = spoken;
      });
    });
  }

  // ---- engine console hook ----
  var shown = false;
  function reveal() {
    if (shown) return; shown = true; $("load").style.opacity = 0;
    setTimeout(function () { $("load").style.display = "none"; staticOn = false; }, 1300);
    $("canvas").focus();
  }
  function onPrint(t) {
    t = String(t); (window.__log = window.__log || []).push(t); if (window.__log.length > 400) window.__log.shift();
    var m = t.match(/RELAY:say (.*)\|([^|]*)\|([^|]*)\s*$/);
    if (m) { window.__relaylog = (window.__relaylog || []).concat([t]); speak(m[1], m[2].trim(), m[3].trim()); reveal(); return; }
    if (/entered the game/i.test(t)) setTimeout(reveal, 900);
  }

  // FTE web prints engine console lines with console.log (not Module.print): tee it
  var ocl = console.log;
  console.log = function (a) { try { if (typeof a === "string") onPrint(a); } catch (e) {} return ocl.apply(console, arguments); };

  // the pak ships gzipped (static hosts do not compress .pak); inflate natively before handing it to the engine
  function gunzip(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer(); });
  }
  function ab(s) { return new TextEncoder().encode(s).buffer; }
  function boot(lines) {
    var fmf = 'FTEManifestVer 1\ngame quake\nname "THE ROOMS"\nbasegame id1\ngamedir rooms\n';
    var files = { "default.fmf": ab(fmf), "id1/lq_core.pak": gunzip("game/id1/lq_core.pak.gz"), "rooms/rooms.pk3": "game/rooms/rooms.pk3", "rooms/wh.cfg": ab(cfgText(lines)) };
    window.Module = {
      files: files, autostart: true, quiturl: location.href, mayregisterscemes: false,
      arguments: ["-manifest", "default.fmf", "+exec", "wh.cfg", "+map", MAP],
      print: onPrint, printErr: function () {},
      canvas: $("canvas"),
      setStatus: function (t) { var m = t && t.match(/\((\d+(\.\d+)?)\/(\d+)\)/); if (m) { $("bar").hidden = false; $("bar").firstChild.style.width = (100 * m[1] / m[3]) + "%"; } },
      totalDependencies: 0,
      monitorRunDependencies: function (left) { this.totalDependencies = Math.max(this.totalDependencies, left); Module.setStatus(left ? "(" + (this.totalDependencies - left) + "/" + this.totalDependencies + ")" : ""); if (!left) msg("entering..."); },
      postRun: []
    };
    var s = document.createElement("script"); s.src = "ftewebgl.js"; s.onerror = function () { msg("could not load the engine"); };
    document.head.appendChild(s);
    setTimeout(reveal, 60000);
  }

  // the engine renames the tab once the map is up: use that as the 'in-world' signal, and keep our title
  new MutationObserver(function () { if (document.title !== "THE ROOMS") { document.title = "THE ROOMS"; } })
    .observe(document.querySelector("title"), { childList: true });
  // ---- start ----
  msg("reading the ledger...");
  var started = false;
  var pre = Promise.all([jget("/me").catch(function () { return null; }), jget("/transcripts?limit=50").catch(function () { return null; })])
    .then(function (a) { window.__lines = buildLines(a[0], a[1]); if (!started) { msg(""); $("go").hidden = false; } });
  $("go").onclick = function () {
    started = true;
    $("go").hidden = true; msg("loading...");
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); AC.resume(); } catch (e) {}
    pre.then(function () { boot(window.__lines || []); });
  };
  if (q.get("autostart")) setTimeout(function () { $("go").click(); }, 500);
  window.__rooms = { buildLines: buildLines, cfgText: cfgText, speak: speak, RELAY: RELAY, VID: VID };
})();
