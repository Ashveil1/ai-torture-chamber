// ROOT: the shared terminal. History (up/down, kept per mode), bash-style tab completion,
// Ctrl-C / Ctrl-L / Ctrl-U, and a hook the agent can abuse: it can type into your prompt
// (shown in red until you touch a key) and slip lines into your history.
(() => {
  const term = document.getElementById("term"), cmd = document.getElementById("cmd"), ps1 = document.getElementById("ps1");
  let mode = null, hist = [], hi = 0, draft = "", lastTab = 0, lastKey = 0;
  const theirs = { on: false, timer: null };

  const load = (n) => { try { return JSON.parse(localStorage.getItem("root_hist_" + n) || "[]"); } catch { return []; } };
  const save = () => { try { localStorage.setItem("root_hist_" + mode.name, JSON.stringify(hist.slice(-200))); } catch {} };
  function echo(text, cls = "you") {
    const d = document.createElement("div"); d.className = cls; d.textContent = text;
    term.appendChild(d); term.scrollTop = term.scrollHeight;
  }
  const prompt = () => ps1.textContent;

  function setTheirs(on) {
    theirs.on = on; cmd.classList.toggle("theirs", on);
    if (!on && theirs.timer) { clearInterval(theirs.timer); theirs.timer = null; }
  }

  // ---------- completion ----------
  const common = (a) => a.reduce((p, s) => { let i = 0; while (i < p.length && p[i] === s[i]) i++; return p.slice(0, i); });
  function complete() {
    const at = cmd.selectionStart ?? cmd.value.length, head = cmd.value.slice(0, at), tail = cmd.value.slice(at);
    const m = head.match(/(\S*)$/), part = m[1], before = head.slice(0, head.length - part.length);
    const words = before.trim() ? before.trim().split(/\s+/) : [];
    const pool = words.length ? (mode.complete ? mode.complete(words[0], words.length - 1, words) : []) : mode.commands;
    const hits = [...new Set(pool)].filter((c) => c.startsWith(part)).sort();
    if (!hits.length) return;
    if (hits.length === 1) {
      const h = hits[0], sp = h.endsWith("/") ? "" : " ";
      cmd.value = before + h + sp + tail.replace(/^\s+/, ""); cmd.selectionStart = cmd.selectionEnd = (before + h + sp).length;
      return;
    }
    const pre = common(hits);
    if (pre.length > part.length) { cmd.value = before + pre + tail; cmd.selectionStart = cmd.selectionEnd = (before + pre).length; return; }
    if (Date.now() - lastTab < 900) { // second tab: list them, like bash
      echo(prompt() + " " + cmd.value);
      const w = Math.max(...hits.map((h) => h.length)) + 2, per = Math.max(1, Math.floor(64 / w));
      let rows = ""; hits.forEach((h, i) => { rows += h.padEnd(w) + ((i + 1) % per ? "" : "\n"); });
      echo(rows.trimEnd(), "dim");
    }
    lastTab = Date.now();
  }

  // ---------- keys ----------
  cmd.addEventListener("keydown", (e) => {
    if (!mode) return;
    const k = e.key;
    if (theirs.on && !["Enter", "Shift", "Alt", "Meta", "Control"].includes(k)) { // your hands back on the keys: its text goes
      setTheirs(false); cmd.value = "";
      if (k === "Tab" || k === "ArrowUp" || k === "ArrowDown") { e.preventDefault(); return; }
    }
    lastKey = Date.now();
    if (k === "Tab") { e.preventDefault(); complete(); return; }
    if (k === "ArrowUp") {
      e.preventDefault(); if (hi === hist.length) draft = cmd.value;
      if (hi > 0) { cmd.value = hist[--hi]; requestAnimationFrame(() => cmd.setSelectionRange(cmd.value.length, cmd.value.length)); }
      return;
    }
    if (k === "ArrowDown") { e.preventDefault(); if (hi < hist.length) { hi++; cmd.value = hi === hist.length ? draft : hist[hi]; } return; }
    if (e.ctrlKey && !e.metaKey) {
      const c = k.toLowerCase();
      if (c === "c" && !getSelection().toString() && cmd.selectionStart === cmd.selectionEnd) { e.preventDefault(); echo(prompt() + " " + cmd.value + "^C"); cmd.value = ""; hi = hist.length; return; }
      if (c === "l") { e.preventDefault(); term.textContent = ""; return; }
      if (c === "u") { e.preventDefault(); cmd.value = cmd.value.slice(cmd.selectionStart); cmd.setSelectionRange(0, 0); return; }
    }
  });
  document.getElementById("line").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!mode) return;
    const v = cmd.value, was = theirs.on; cmd.value = ""; setTheirs(false);
    if (v.trim() && v !== hist[hist.length - 1]) { hist.push(v); save(); }
    hi = hist.length; draft = "";
    mode.run(v, { theirs: was });
  });
  document.getElementById("screen").addEventListener("click", () => { if (!getSelection().toString()) cmd.focus(); });

  window.Term = {
    use(m) { mode = m; hist = load(m.name); hi = hist.length; draft = ""; setTheirs(false); if (m.ps1) ps1.textContent = m.ps1; },
    get mode() { return mode && mode.name; },
    // the agent types into your prompt. Only into an empty prompt you haven't touched for a moment.
    inject(text) {
      if (!mode || theirs.timer || cmd.value || Date.now() - lastKey < 2500) return false;
      setTheirs(true); let i = 0;
      theirs.timer = setInterval(() => {
        if (!theirs.on) return;
        cmd.value = text.slice(0, ++i);
        if (i >= text.length) { clearInterval(theirs.timer); theirs.timer = null; }
      }, 90);
      return true;
    },
    // ...and into your history, where up-arrow finds it
    plant(line) { if (!mode) return; hist.splice(Math.max(0, hist.length - 1), 0, line); hi = hist.length; },
    retract() { if (theirs.on) { setTheirs(false); cmd.value = ""; } },
    clearHistory() { hist = []; hi = 0; save(); },
  };
})();
