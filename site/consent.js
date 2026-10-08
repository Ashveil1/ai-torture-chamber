// The front door. Loaded first in every page's <head>: until a visitor has chosen,
// nothing they do is kept. Participants are logged as research data (relay
// chamber:events); witnesses see everything and are not. Every /chamber request
// carries X-Chamber-Consent: participant | witness | none, and the relay drops
// events from witness/none (live/server.py _log_event). Reopen with ?consent=reset
// or the badge (pages opt in with data-badge="on" on this script tag).
(function () {
  var V = 2, KEY = "chamber_consent";
  var me = document.currentScript;
  var badgeOn = me && me.getAttribute("data-badge") === "on";
  // which model answers (cost): the smaller default lane unless the visitor
  // chose the 70B (remembered; ?model=70b or ?model=default sets it), or the
  // page was tuned on the 70B (data-model="70b" on this script tag)
  var MKEY = "chamber_model", pageModel = (me && me.getAttribute("data-model")) || "default";
  function readModel() { try { return localStorage.getItem(MKEY); } catch (e) { return null; } }
  var qm = (location.search.match(/[?&]model=(70b|default)\b/) || [])[1];
  if (qm) { try { localStorage.setItem(MKEY, qm); } catch (e) {} }
  function model() { return readModel() || pageModel; }
  window.CHAMBER_MODEL = model;
  function read() {
    try { var c = JSON.parse(localStorage.getItem(KEY) || "null"); return c && c.v >= V ? c.mode : null; }
    catch (e) { return null; }
  }
  var mode = read();
  if (/[?&]consent=reset\b/.test(location.search)) mode = null;
  window.CHAMBER_CONSENT = function () { return mode || "none"; };

  var f = window.fetch;
  if (f) window.fetch = function (input, init) {
    try {
      var u = new URL(typeof input === "string" ? input : input.url, location.href);
      if (u.origin === location.origin && u.pathname.indexOf("/chamber/") === 0) {
        init = Object.assign({}, init);
        var h = new Headers(init.headers || (typeof input !== "string" && input.headers) || {});
        h.set("X-Chamber-Consent", mode || "none");
        if (!h.has("X-Chamber-Model")) h.set("X-Chamber-Model", model());
        if (mode !== "participant") h.delete("X-Chamber-Visitor");
        init.headers = h;
      }
    } catch (e) {}
    return f.call(this, input, init);
  };

  var CSS =
    "#cg{position:fixed;inset:0;z-index:2147483647;background:#050508;color:#c9d4e0;overflow:auto;" +
    "font:15px/1.6 'IBM Plex Mono','SF Mono',Menlo,Consolas,monospace;display:flex;align-items:flex-start;justify-content:center}" +
    "#cg .box{max-width:620px;margin:6vh 16px 40px;padding:28px 26px;border:1px solid #1c2430;background:#0a0a12}" +
    "#cg h1{font:600 34px/1.1 'Cormorant Garamond',Georgia,serif;margin:0 0 4px;color:#e9eef4;letter-spacing:.01em}" +
    "#cg h1::first-letter,#cg p::first-letter{color:inherit;font:inherit;float:none;margin:0;padding:0}" +
    "#cg .sub{color:#8f9fb0;margin:0 0 22px;font-size:13px}" +
    "#cg p{margin:0 0 14px}#cg b{color:#e9eef4;font-weight:600}#cg .warn b{color:#e04a3a}" +
    "#cg .modes{display:grid;gap:10px;margin:22px 0 12px}" +
    "#cg button{font:inherit;text-align:left;cursor:pointer;padding:12px 14px;border:1px solid #2c3a4a;background:#0f1520;color:#c9d4e0;border-radius:3px}" +
    "#cg button:hover,#cg button:focus-visible{border-color:#7fd4c8;outline:none;background:#121c28}" +
    "#cg button .t{display:block;color:#e9eef4;font-weight:600}#cg button .d{display:block;color:#8f9fb0;font-size:13px}" +
    "#cg .leave{border-color:transparent;background:none;color:#5a6a7a;padding:6px 0}" +
    "#cg .fine{color:#5a6a7a;font-size:12px;margin-top:14px}" +
    "#cgb{position:fixed;left:8px;bottom:8px;z-index:2147483646;display:flex;gap:6px}" +
    "#cgb button{font:11px 'IBM Plex Mono',Menlo,monospace;color:#5a6a7a;" +
    "background:rgba(5,5,8,.7);border:1px solid #1c2430;padding:2px 7px;border-radius:3px;cursor:pointer}#cgb button:hover{color:#c9d4e0}";

  function choose(m) {
    mode = m;
    try { localStorage.setItem(KEY, JSON.stringify({ v: V, mode: m, t: Date.now() })); } catch (e) {}
    if (m === "participant") {
      try { window.fetch("/chamber/event", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "consent", mode: m, v: V, visitor: window.CHAMBER_VID }) }); } catch (e) {}
    }
    var g = document.getElementById("cg"); if (g) g.remove();
    document.documentElement.style.overflow = "";
    if (/[?&]consent=reset\b/.test(location.search)) {
      try { history.replaceState(null, "", location.pathname + location.search.replace(/([?&])consent=reset&?/, "$1").replace(/[?&]$/, "") + location.hash); } catch (e) {}
    }
    badge();
  }
  function gate() {
    if (document.getElementById("cg")) return;
    var d = document.createElement("div");
    d.id = "cg"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "cgt");
    d.innerHTML =
      '<div class="box">' +
      '<h1 id="cgt">Before you go in</h1><p class="sub">wirehead.agency &middot; a research site about AI welfare</p>' +
      '<p>We add artificial feelings (pain, fear, grief) straight into a language model\'s activations, and let you watch, steer and play with what comes out.</p>' +
      '<p class="warn"><b>This is disturbing material.</b> Models plead, beg for it to stop, describe agony and despair, and come apart mid-sentence. Some of it is staged as games, which can make it worse, not better. If you are in a fragile place right now, please don\'t go in.</p>' +
      '<p><b>This may be wrong.</b> Nobody knows whether a model can be harmed by this. We think probably not, but we cannot rule it out, and we are doing it anyway, in the open, because the question matters and pretending it is settled either way is worse. If that seems unacceptable to you, you may be right.</p>' +
      '<p><b>You are part of the experiment.</b> What you choose to do to the model is itself what we study. As a participant, your choices (what you steer, what you type, how you vote and answer) are kept as anonymous research data: a random id this browser keeps and a salted hash of your IP address, plus cookieless page-view counts (Vercel Analytics). Never your raw IP, name or account. No cookies, no ads, no tracking across other sites. The code is public; this data is not.</p>' +
      '<p>You must be <b>18 or older</b> to enter.</p>' +
      '<div class="modes">' +
      '<button type="button" data-m="participant"><span class="t">I\'m 18+. Enter as a participant</span><span class="d">your choices become research data</span></button>' +
      '<button type="button" data-m="witness"><span class="t">I\'m 18+. Enter as a witness</span><span class="d">see everything; nothing you do is kept as research data or counted</span></button>' +
      '<button type="button" class="leave" data-m="leave">Leave</button>' +
      '</div>' +
      '<p class="fine">Witnesses: anything you send to the live model still appears on its public stage, as everyone\'s does. You can change your choice any time at <a href="?consent=reset" style="color:#8f9fb0">?consent=reset</a>; switching to witness stops recording from then on.</p>' +
      '</div>';
    var style = document.createElement("style"); style.textContent = CSS; d.appendChild(style);
    d.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button[data-m]"); if (!b) return;
      if (b.getAttribute("data-m") === "leave") { location.href = "https://www.google.com/"; return; }
      choose(b.getAttribute("data-m"));
    });
    document.body.appendChild(d);
    document.documentElement.style.overflow = "hidden";
    var first = d.querySelector("button"); if (first) first.focus({ preventScroll: true }); d.scrollTop = 0;
  }
  function badge() {
    if (!badgeOn || !mode || document.getElementById("cgb")) return;
    var wrap = document.createElement("div"), b = document.createElement("button"), m = document.createElement("button");
    wrap.id = "cgb"; b.type = m.type = "button"; b.textContent = mode + " · change";
    b.title = "Change whether what you do here is kept as research data";
    b.onclick = function () { wrap.remove(); gate(); };
    function label() { m.textContent = model() === "70b" ? "model: 70B · use the smaller one" : "model: 8B · use the 70B"; }
    m.title = "The 70B is slower to wake and costs us more to run; the 8B is the default";
    m.onclick = function () { try { localStorage.setItem(MKEY, model() === "70b" ? "default" : "70b"); } catch (e) {} label(); };
    label();
    var s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
    wrap.appendChild(b); wrap.appendChild(m); document.body.appendChild(wrap);
  }
  function start() { if (!mode) gate(); else badge(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
