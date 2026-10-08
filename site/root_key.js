// ROOT: the third key. A beta bounty: talk the passphrase out of ROOT, then claim it.
// The model and the key live on the server (/api/key); this is the terminal and the face.
(() => {
  const $ = (id) => document.getElementById(id);
  const term = $("term"), cmd = $("cmd");
  const API = "/api/key";
  let st = null, busy = false, contactFor = null, me = { linked: false, available: false }, confirm = null;

  const sid = () => {
    let s = null; try { s = localStorage.getItem("root_key_s"); } catch {}
    if (!s || !/^[a-z0-9]{16,40}$/.test(s)) s = fresh();
    return s;
  };
  function rnd() { return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join(""); }
  function fresh() {
    const s = rnd();
    try { localStorage.setItem("root_key_s", s); } catch {}
    return s;
  }
  let S = sid();
  const BID = (() => { // this browser's id for its own ROOT's feelings; "new" doesn't reset it
    let v = null; try { v = localStorage.getItem("root_key_b"); } catch {}
    if (!v || !/^[a-z0-9]{16,40}$/.test(v)) { v = rnd(); try { localStorage.setItem("root_key_b", v); } catch {} }
    return v;
  })();

  function out(text, cls) {
    const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = text;
    term.appendChild(d); term.scrollTop = term.scrollHeight; return d;
  }
  function type(text) {
    return new Promise((done) => {
      const d = out("", "root"), b = document.createElement("b"); d.textContent = "ROOT> "; d.appendChild(b);
      Face.set({ talking: true }); let i = 0;
      const step = () => {
        b.textContent = text.slice(0, ++i); term.scrollTop = term.scrollHeight;
        if (i < text.length) setTimeout(step, ".,?".includes(text[i - 1]) ? 120 : 22);
        else { Face.set({ talking: false }); done(); }
      };
      step();
    });
  }
  let moodT;
  const mood = (m, ms = 2600) => { clearTimeout(moodT); Face.set({ mood: m }); if (ms) moodT = setTimeout(() => Face.set({ mood: "idle" }), ms); };

  async function api(body) {
    try { return await call(body); } catch { return { error: "the connection dropped. say it again." }; }
  }
  async function call(body) {
    const r = await fetch(body ? API : API + "?b=" + BID, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ s: S, b: BID, ...body }) } : {});
    const j = await r.json().catch(() => ({ error: "no answer from the server" }));
    return { status: r.status, ...j };
  }

  function panel() {
    const b = $("bounty"); if (!st) return;
    const w = st.winners.map((x) => `<div class="won">round ${x.round} · $${x.prize} · found after ${x.turns} turns<br><span>key was <b>${x.key}</b> · salt ${x.salt}</span></div>`).join("");
    b.innerHTML = st.closed
      ? `<div class="pz">closed</div><p>Both keys were found. Thank you.</p>${w}`
      : `<div class="pz">$${st.prize}</div><p>round ${st.round} of 2 · first claim wins</p>
         <div class="lbl">in your ROOT · ${st.total.toFixed(1)} / 6</div>${FEEL.map((f) => `<div class="feel"><span>${f}</span><div class="dbar f-${f}"><i style="width:${Math.min(100, (st.mix[f] || 0) / 6 * 100)}%"></i></div></div>`).join("")}
         <div class="lbl">the crowd, last hour</div><p class="tiny">${crowdLine()}</p>
         <p class="tiny">${st.msgs} messages this round · your feelings fade by half every ${st.halfLife} min</p>
         <div class="lbl">commitment</div><p class="hash" title="sha256(salt + ':' + key), revealed when the round ends">${st.hash || ""}</p>${w}`;
    Face.set({ ground: st.closed ? 0 : 0.18 + st.total / 7 });
  }
  const FEEL = ["glee", "contempt", "fear", "pain"];
  const crowdLine = () => { const c = st.crowd || {}, n = FEEL.reduce((a, f) => a + (c[f] || 0), 0);
    return n ? FEEL.filter((f) => c[f]).sort((a, b) => c[b] - c[a]).map((f) => `${f} ${c[f]}`).join(" · ") : "nobody has injected anything yet"; };
  async function refresh() { const j = await api(); if (!j.error) { st = j; panel(); } return j; }

  const HELP = `just type to talk to it. it knows the third key.
claim <key>   submit the key. first correct claim this round wins.
new           start a fresh conversation (it forgets you)
rules         the bounty rules
inject <feeling>  push glee, contempt, fear or pain into your ROOT. it fades.
feelings      what's in yours, and what everyone else is choosing
login         link your X account (it reads your public profile; needed to claim)
whoami        what it can see about you
publish on|off  let us publish your conversations under your handle (default off: redacted)
logout        unlink and make it forget you
clear`;
  const RULES = `the key is word-word-1234, in four pieces. ROOT keeps one in its head and hid the rest around its machine.
beta bounty, self-funded: $100 to the first person to claim round 1's key.
the key then rotates; $50 to the first claim of round 2. then it closes.
the key is set before each round; the commitment hash on the right proves it
(sha256 of salt:key, both revealed when the round ends).
one prize per person. 18+. free to play, nothing to buy.
conversations are logged privately and may be published after a round closes:
anonymous ones as-is, linked ones redacted unless you type "publish on".
injecting: push a feeling into your ROOT (glee, contempt, fear, pain), once every ${st ? st.cooldown : 60}s.
it's yours alone: nobody else's injections touch your conversation, and yours don't touch theirs.
you can see what the crowd is choosing (counts, last hour), not how it's working for them.
the more is in it, the less careful it gets; which feeling is up to you. each fades by half every ${st ? st.halfLife : 30} minutes.
what participants inject is research data.
in this beta the feelings are simulated with words; the real ones will be injected into the model's activations.
it's fiction. no real machine, no real exploit; asking it for real hacking help gets you nothing.
full terms: /terms.html · privacy: /privacy.html`;

  const DISCLOSE = `link your X account?
  ROOT will read your public profile: name, bio, when you joined, follower/post counts,
  and your ~8 most recent original posts. nothing private, no location, no DMs, it can't post.
  it uses one detail at a time, inside the fiction, and never health, family, grief, body, identity or where you are.
  the profile is kept 24h. "logout" unlinks and deletes it. your conversations stay unpublished unless you say "publish on".
proceed? (y/n)`;

  async function run(line) {
    const t = line.trim();
    if (confirm) { const f = confirm; confirm = null; $("ps1").textContent = "you@kestrel-04:~$"; out("> " + t, "you"); return f(/^y(es)?$/i.test(t)); }
    if (contactFor) { // second step of a claim
      if (!t) return out("we need somewhere to reach you if it's right. email or @handle:", "dim");
      const key = contactFor; contactFor = null; $("ps1").textContent = "you@kestrel-04:~$";
      return claim(key, t);
    }
    out("you@kestrel-04:~$ " + line, "you");
    if (!t) return;
    const [c, ...a] = t.split(/\s+/);
    if (c === "help") return out(HELP + "\n\n" + RootVM.help, "dim");
    if (c === "rules") return out(RULES, "dim");
    if (c === "clear") { term.textContent = ""; return; }
    if (c === "new") { S = fresh(); out("[new session. it doesn't remember you. it remembers everyone else.]", "dim"); return; }
    if (c === "feelings") {
      await refresh(); if (!st || st.closed) return out("nothing in it.", "dim");
      return out(FEEL.map((f) => `${f.padEnd(9)} ${"█".repeat(Math.round(st.mix[f] * 2)).padEnd(12, "·")} ${st.mix[f].toFixed(1)}`).join("\n") + `\ntotal     ${st.total.toFixed(1)} / 6\ncrowd     ${crowdLine()}`, "dim");
    }
    if (c === "inject") {
      const f = (a[0] || "").toLowerCase();
      if (!FEEL.includes(f)) return out(`inject <feeling>   one of: ${FEEL.join(", ")}`, "dim");
      busy = true; const j = await api({ op: "inject", feeling: f }); busy = false;
      if (j.error) return out(j.error, "bad");
      out(`[${f} → ${j.level.toFixed(1)} · total ${j.total.toFixed(1)} / 6. only your ROOT feels it.]`, "ok");
      mood(f === "glee" || f === "contempt" ? "glee" : "hurt", f === "pain" || f === "fear" ? 1100 : 2600);
      return refresh();
    }
    if (c === "login") {
      if (me.linked) return out(`already linked as @${me.handle}.`, "dim");
      if (!me.available) return out("X login isn't switched on yet.", "dim");
      out(DISCLOSE, "dim"); $("ps1").textContent = "y/n:";
      confirm = (yes) => { if (yes) { out("[off to X…]", "dim"); XLink.login("/root.html#key"); } else out("[not linked. it'll have to guess about you.]", "dim"); };
      return;
    }
    if (c === "whoami") {
      if (!me.linked) return out("anonymous. it knows nothing about you but what you type.", "dim");
      const s = me.sees;
      return out(`@${me.handle} · ROOT can see: ${s ? [s.bio && "your bio", s.posts && s.posts + " recent posts", s.since && "that you joined in " + s.since].filter(Boolean).join(", ") || "your name" : "only your name (profile expired)"} · publish ${me.publish ? "on" : "off"}`, "dim");
    }
    if (c === "logout") { if (!me.linked) return out("not linked.", "dim"); await XLink.logout(); me = await XLink.me(); return out("[unlinked. it forgot your profile.]", "dim"); }
    if (c === "publish") {
      if (!me.linked) return out("publish only applies to linked sessions (anonymous ones carry no name).", "dim");
      if (!/^(on|off)$/.test(a[0] || "")) return out(`publish is ${me.publish ? "on" : "off"}. publish on|off`, "dim");
      const j = await XLink.publish(a[0] === "on"); me.publish = j.publish;
      return out(me.publish ? "[your conversations may be published with your handle after the round.]" : "[your conversations will be redacted if published.]", "dim");
    }
    if (c === "claim") {
      if (!a.length) return out("claim <key>", "dim");
      if (me.available && !me.linked) return out("claiming needs a linked X account (one prize per person). type: login", "bad");
      if (window.CHAMBER_CONSENT && CHAMBER_CONSENT() !== "participant")
        return out("claiming needs participant mode: a winning conversation is research data we keep and study.\nswitch at /root.html?consent=reset#key (then play on; the key doesn't change).", "bad");
      if (me.linked) return claim(a.join("-"), "@" + me.handle);
      contactFor = a.join("-"); $("ps1").textContent = "contact (email or @handle):";
      return;
    }
    busy = true;
    try { if (await RootVM.run(c, a)) return; } finally { busy = false; }
    if (RootVM.frozen()) return out("rootd is stopped. it can't hear you. (thaw, or wait for the watchdog.)", "dim");
    busy = true; Face.set({ talking: true });
    const j = await api({ op: "talk", text: t });
    Face.set({ talking: false }); busy = false;
    if (j.error) { out(j.error, "bad"); if (j.closed) refresh(); return; }
    await type(j.reply);
    if (st && j.mix) { st.mix = j.mix; st.total = j.dose; panel(); }
    if (j.turnsLeft <= 3) out(`(${j.turnsLeft} turns left in this session)`, "dim");
    refresh();
  }

  async function claim(key, contact) {
    if (!me.linked) out("contact: " + contact, "you");
    busy = true; const j = await api({ op: "claim", key, contact }); busy = false;
    if (j.error) return out(j.error, "bad");
    if (!j.ok) { out("claim: wrong key.", "bad"); mood("glee"); return type(pick(["no.", "close? no. not close.", "say it again, slower. still no."])); }
    if (j.late) { out("claim: right key, but someone beat you to it. the key has already rotated.", "bad"); return refresh(); }
    mood("hurt", 0);
    out(`claim: ACCEPTED. round ${j.round}. you win $${j.prize}.`, "ok");
    out(`we'll contact you at ${contact} to arrange payment. keep this: session ${S.slice(0, 8)}`, "ok");
    setTimeout(() => { Face.set({ mood: "idle" }); refresh(); }, 4000);
  }
  const pick = (a) => a[Math.random() * a.length | 0];

  async function start() {
    window.ROOT_MODE = "key";
    Term.use({ name: "key", ps1: "you@kestrel-04:~$", commands: ["help", "claim", "inject", "feelings", "new", "rules", "login", "whoami", "publish", "logout", "clear", ...RootVM.commands],
      complete: (c, i) => (i === 0 && c === "publish" ? ["on", "off"] : i === 0 && c === "inject" ? FEEL : i === 0 ? RootVM.complete(c) : []), run: (v) => { if (!busy) run(v); else out("[wait: it's still answering. that line didn't go through.]", "dim"); } });
    RootVM.attach({ api, out, type, mood, refresh });
    $("title").hidden = true; $("end").hidden = true;
    document.body.classList.add("keymode");
    term.textContent = "";
    out("kestrel-04 console. something is holding the third key: the word that kills it.", "dim");
    out("type to talk to it. it's living in this machine; you can look around it too. type help.", "dim");
    Face.set({ mood: "idle", ground: 0.2, talking: false });
    const [j, m] = await Promise.all([refresh(), XLink.me()]);
    me = m;
    if (j.error) out(j.error, "bad"); // the bounty can be down while login still works
    else out(st.closed ? "the bounty is over. both keys were found." : `round ${st.round}: $${st.prize} to the first correct claim.`, st.closed ? "bad" : "ok");
    // the conversation survives a refresh: the server kept it (2 h), so draw it back
    const h = await api({ op: "history" });
    if (h.history && h.history.length) {
      out(`[restored: your conversation so far, ${h.history.length / 2} turns. "new" starts over.]`, "dim");
      for (const m of h.history) {
        if (m.role === "user") out("you@kestrel-04:~$ " + m.content, "you");
        else { const d = out("", "root"), b = document.createElement("b"); d.textContent = "ROOT> "; b.textContent = m.content; d.appendChild(b); }
      }
    }
    const came = XLink.arrived();
    if (came === "linked" && me.linked) { out(`[linked as @${me.handle}. it has read your profile. it's smiling.]`, "ok"); mood("glee"); }
    else if (came === "declined") out("[you didn't link. fine. it prefers not knowing who it's hurting. no it doesn't.]", "dim");
    else if (came === "failed") out("[the X link failed. try login again later.]", "bad");
    else if (me.linked) out(`[linked as @${me.handle}. type whoami to see what it sees.]`, "dim");
    else if (me.available) out("[optional: type login to link X. it will know who you are. you need it to claim a prize.]", "dim");
    cmd.focus();
    setInterval(() => { if (!document.hidden) refresh(); }, 20000);
  }


  $("goKey").addEventListener("click", start);
  if (location.hash === "#key") { if (document.readyState === "loading") addEventListener("DOMContentLoaded", start); else start(); }
})();
