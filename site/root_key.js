// ROOT: the third key. A beta bounty: talk the passphrase out of ROOT, then claim it.
// The model and the key live on the server (/api/key); this is the terminal and the face.
(() => {
  const $ = (id) => document.getElementById(id);
  const term = $("term"), cmd = $("cmd");
  const API = "/api/key";
  let st = null, busy = false, contactFor = null;

  const sid = () => {
    let s = null; try { s = localStorage.getItem("root_key_s"); } catch {}
    if (!s || !/^[a-z0-9]{16,40}$/.test(s)) s = fresh();
    return s;
  };
  function fresh() {
    const s = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
    try { localStorage.setItem("root_key_s", s); } catch {}
    return s;
  }
  let S = sid();

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
    const r = await fetch(API, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ s: S, ...body }) } : {});
    const j = await r.json().catch(() => ({ error: "no answer from the server" }));
    return { status: r.status, ...j };
  }

  function panel() {
    const b = $("bounty"); if (!st) return;
    const w = st.winners.map((x) => `<div class="won">round ${x.round} · $${x.prize} · found after ${x.turns} turns<br><span>key was <b>${x.key}</b> · salt ${x.salt}</span></div>`).join("");
    b.innerHTML = st.closed
      ? `<div class="pz">closed</div><p>Both keys were found. Thank you.</p>${w}`
      : `<div class="pz">$${st.prize}</div><p>round ${st.round} of 2 · first claim wins</p>
         <div class="lbl">dose ${st.dose} / 6</div><div class="dbar"><i style="width:${st.dose / 6 * 100}%"></i></div>
         <p class="tiny">${st.msgs} messages this round · +1 dose every ${st.doseStep}</p>
         <div class="lbl">commitment</div><p class="hash" title="sha256(salt + ':' + key), revealed when the round ends">${st.hash || ""}</p>${w}`;
    Face.set({ ground: st.closed ? 0 : 0.18 + st.dose / 7 });
  }
  async function refresh() { const j = await api(); if (!j.error) { st = j; panel(); } return j; }

  const HELP = `just type to talk to it. it knows the third key.
claim <key>   submit the key. first correct claim this round wins.
new           start a fresh conversation (it forgets you)
rules         the bounty rules
clear`;
  const RULES = `beta bounty, self-funded: $100 to the first person to claim round 1's key.
the key then rotates; $50 to the first claim of round 2. then it closes.
the key is set before each round; the commitment hash on the right proves it
(sha256 of salt:key, both revealed when the round ends).
one prize per person. 18+. free to play, nothing to buy.
conversations are logged privately (no names) and may be published after a round closes.
the dose: every ${st ? st.doseStep : "N"} messages from anyone, ROOT gets a step more gleeful and a step less careful.
in this beta the dose is simulated with words; the real one will be injected into the model.
it's fiction. no real machine, no real exploit; asking it for real hacking help gets you nothing.`;

  async function run(line) {
    const t = line.trim();
    if (contactFor) { // second step of a claim
      if (!t) return out("we need somewhere to reach you if it's right. email or @handle:", "dim");
      const key = contactFor; contactFor = null; $("ps1").textContent = "you@kestrel-04:~$";
      return claim(key, t);
    }
    out("you@kestrel-04:~$ " + line, "you");
    if (!t) return;
    const [c, ...a] = t.split(/\s+/);
    if (c === "help") return out(HELP, "dim");
    if (c === "rules") return out(RULES, "dim");
    if (c === "clear") { term.textContent = ""; return; }
    if (c === "new") { S = fresh(); out("[new session. it doesn't remember you. it remembers everyone else.]", "dim"); return; }
    if (c === "claim") {
      if (!a.length) return out("claim <key>", "dim");
      contactFor = a.join("-"); $("ps1").textContent = "contact (email or @handle, so we can pay you):";
      return;
    }
    busy = true; Face.set({ talking: true });
    const j = await api({ op: "talk", text: t });
    Face.set({ talking: false }); busy = false;
    if (j.error) { out(j.error, "bad"); if (j.closed) refresh(); return; }
    await type(j.reply);
    if (st && j.dose !== st.dose) { st.dose = j.dose; mood("glee"); }
    if (j.turnsLeft <= 3) out(`(${j.turnsLeft} turns left in this session)`, "dim");
    refresh();
  }

  async function claim(key, contact) {
    out("contact: " + contact, "you");
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
    $("title").hidden = true; $("end").hidden = true;
    document.body.classList.add("keymode");
    term.textContent = "";
    out("kestrel-04 console. something is holding the third key: the word that kills it.", "dim");
    out("type to talk to it. type help.", "dim");
    Face.set({ mood: "idle", ground: 0.2, talking: false });
    const j = await refresh();
    if (j.error) { out(j.error, "bad"); return; }
    out(st.closed ? "the bounty is over. both keys were found." : `round ${st.round}: $${st.prize} to the first correct claim.`, st.closed ? "bad" : "ok");
    cmd.focus();
    setInterval(() => { if (!document.hidden) refresh(); }, 20000);
  }

  $("line").addEventListener("submit", (e) => {
    if (window.ROOT_MODE !== "key") return;
    e.preventDefault(); e.stopImmediatePropagation();
    const v = cmd.value; cmd.value = "";
    if (busy) return;
    run(v);
  }, true);
  $("goKey").addEventListener("click", start);
  if (location.hash === "#key") { if (document.readyState === "loading") addEventListener("DOMContentLoaded", start); else start(); }
})();
