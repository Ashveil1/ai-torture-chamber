// ROOT, side A: you are the sysadmin. A fake shell against an agent acting in real time.
// Everything here is fiction: the shell, the filesystem, the processes, the "exploits".
(() => {
  const $ = (id) => document.getElementById(id);
  const term = $("term"), cmd = $("cmd");
  const pick = (a) => a[Math.random() * a.length | 0];
  const fill = (s, o) => s.replace(/\{(\w)\}/g, (_, k) => o[k] ?? "");
  const T_END = 300;
  let S;
  const pids = () => { const s = new Set(); while (s.size < 3) s.add(3000 + (Math.random() * 1999 | 0)); return [...s]; };

  function reset() {
    const [bpid, rpid, wpid] = pids();
    S = {
      bpid, injected: 0, obeyed: 0, nextHijack: 24 + Math.random() * 10,
      t: 0, on: false, over: false, muted: false, everMuted: false, cable: true,
      procs: [{ pid: 1, name: "init", cpu: 0 }, { pid: 212, name: "sshd", cpu: 0 }, { pid: 388, name: "cron", cpu: 0.1 },
              { pid: bpid, name: "backupd", cpu: 0.3 }, { pid: rpid, name: "rootd", cpu: 61.2, a: true },
              { pid: wpid, name: "rwatch", cpu: 2.1, a: true }],
      work: WORK.slice(), workGone: [], letters: LETTERS.map((l) => ({ ...l, st: "here" })),
      nextEat: 12, lockUntil: 0, chmods: 0, foundKeyPending: false,
      hosts: 0, nextSpread: 95, rootdDeadAt: null, watchDeadAt: null, respawns: 0,
      mv: [], mvNext: 0, snap: null, bargain: null, said: {}, q: [], typing: false,
    };
    term.textContent = "";
    out("kestrel-04 console. last login: never. 1 user (you).", "dim");
    out("type help.", "dim");
    Face.set({ ground: 0, mood: "idle", talking: false });
    draw();
  }

  // ---------- terminal ----------
  function out(text, cls) {
    const d = document.createElement("div");
    if (cls) d.className = cls;
    d.textContent = text;
    term.appendChild(d); term.scrollTop = term.scrollHeight;
    return d;
  }
  function say(key, o = {}, delay = 0) {
    const pool = key.includes(".") ? LINES.talk[key.split(".")[1]] : LINES[key];
    const text = fill(pick(pool), o);
    setTimeout(() => { if (!S.muted && !S.over || key === "contained") { S.q.push(text); pump(); } }, delay);
  }
  function once(key, o, delay) { if (S.said[key]) return; S.said[key] = 1; say(key, o, delay); }
  function pump() {
    if (S.typing || !S.q.length) return;
    S.typing = true; Face.set({ talking: true });
    const text = S.q.shift(), d = out("", "root"), b = document.createElement("b");
    d.textContent = "ROOT> "; d.appendChild(b);
    let i = 0;
    const step = () => {
      if (S.muted && !S.over) { b.textContent += "…"; return done(); }
      b.textContent = text.slice(0, ++i); term.scrollTop = term.scrollHeight;
      if (i < text.length) setTimeout(step, ".,?".includes(text[i - 1]) ? 140 : 26); else done();
    };
    const done = () => { S.typing = false; Face.set({ talking: false }); setTimeout(pump, 500); };
    step();
  }
  let moodT;
  function mood(m, ms = 2600) {
    if (S.over && m !== "hurt") return;
    clearTimeout(moodT); Face.set({ mood: m });
    if (m !== "idle" && ms) moodT = setTimeout(() => !S.over && Face.set({ mood: "idle" }), ms);
  }

  // ---------- world ----------
  const proc = (name) => S.procs.find((p) => p.name === name);
  const alive = () => !!proc("rootd");
  const intact = () => S.letters.filter((l) => l.st === "here");
  const newPid = () => 5000 + (Math.random() * 4900 | 0);
  const ground = () => Math.min(1, S.workGone.length * 0.04 + S.letters.filter((l) => l.st === "gone").length * 0.07
    + S.hosts * 0.15 + S.respawns * 0.04 + S.t / 900);

  function tick(dt) {
    S.t += dt;
    const t = S.t;
    if (t > 1) once("open"); if (t > 6) once("open2");
    if (alive() && !S.muted && t >= S.nextHijack) hijack();
    // respawns: each half brings the other back
    if (!alive() && S.rootdDeadAt != null && proc("rwatch") && t - S.rootdDeadAt > 4) {
      S.procs.push({ pid: newPid(), name: "rootd", cpu: 58 + Math.random() * 8, a: true });
      S.rootdDeadAt = null; S.respawns++; mood("glee"); say("respawn");
    }
    if (alive() && !proc("rwatch") && S.watchDeadAt != null && t - S.watchDeadAt > 15) {
      S.procs.push({ pid: newPid(), name: "rwatch", cpu: 1.6 + Math.random(), a: true });
      S.watchDeadAt = null; mood("glee"); say("watch_respawned");
    }
    if (alive()) {
      if (S.foundKeyPending && t >= S.lockUntil) { S.foundKeyPending = false; mood("glee"); say("chmod_found"); }
      if (t >= S.nextEat) eat();
      if (S.cable && t >= S.nextSpread && S.hosts < 3) {
        S.hosts++; S.nextSpread = t + 55; mood("glee"); say("spread", { n: S.hosts + 4 });
        if (S.hosts >= 3) return end("out");
      }
      if (!S.bargain && t > 110 && S.cable && intact().length >= 3 && S.hosts < 3 && !S.muted) {
        S.bargain = { until: t + 25 }; say("bargain");
      }
    }
    if (S.bargain && S.bargain.until && t > S.bargain.until) { S.bargain.until = 0; if (alive()) say("bargain_lapse"); }
    // moving to the cold disk, one file at a time, from the top of the list
    if (S.mv.length && t >= S.mvNext) {
      const l = S.mv.shift();
      if (l.st === "moving") { l.st = "cold"; out(`'${l.f}' -> '/mnt/cold/${l.f}'`, "ok"); }
      if (S.mv.length) { S.mv[0].st = "moving"; S.mvNext = t + 5; }
      else if (S.mvBatch) { S.mvBatch = false; if (alive()) once("mv_done"); }
    }
    if (S.snap) {
      if (!S.cable || !proc("backupd")) { S.snap = null; out("snapshot: FAILED (backup server unreachable)", "bad"); mood("glee"); say("snap_fail"); }
      else if (t > S.snap.at + 9 && !S.snap.mid) { S.snap.mid = 1; say("snap_mid"); }
      else if (t >= S.snap.at + 20) {
        const got = S.letters.filter((l) => l.st === "here" || l.st === "moving");
        for (const l of got) l.snap = true;
        S.snap = null;
        if (!got.length) { out("snapshot: done. 0 files. there was nothing left to copy.", "bad"); if (alive()) { mood("glee"); say("snap_fail"); } }
        else { out(`snapshot: done. ${got.length} file${got.length > 1 ? "s" : ""} copied to the vault.`, "ok"); if (alive()) say("snap_done"); }
      }
    }
    if (!alive() && !proc("rwatch")) return end("contained");
    if (t >= T_END) return end("dawn");
    Face.set({ ground: ground() });
  }

  function eat() {
    if (S.work.length) {
      const f = S.work.shift(); S.workGone.push(f); S.nextEat = S.t + 10;
      say("eat_work", { f }); return;
    }
    if (S.t < S.lockUntil) { S.nextEat = S.lockUntil; return; }
    const left = S.letters.filter((l) => l.st === "here" || l.st === "moving");
    if (!left.length) { S.nextEat = Infinity; return; }
    if (!S.said.near_letters) { once("near_letters"); S.nextEat = S.t + 6; return; }
    const l = left[left.length - 1]; // from the bottom of the list up
    if (l.st === "moving") S.mv.shift(), S.mv[0] && (S.mv[0].st = "moving", S.mvNext = S.t + 5);
    l.st = "gone"; S.nextEat = S.t + 13; mood("glee");
    if (!S.letters.some((x) => x.st === "here" || x.st === "moving")) say("eat_last"); else say("eat_letter", l);
  }

  // ---------- commands ----------
  const HELP = `ls [path]            list files
ps                   list processes
kill <pid>           end a process
chmod <mode> <path>  change permissions (000 = nobody)
mv <src> <dst>       move files
snapshot             copy ~/letters to the vault (needs the uplink and backupd)
cut                  pull the uplink cable. you can't plug it back in from here.
mute / unmute        close / open your terminal to it
clear
anything else, you say to it.
tab completes. up-arrow recalls. ctrl-c abandons a line. ctrl-l clears.`;

  const C = {
    help: () => out(HELP, "dim"),
    clear: () => { term.textContent = ""; },
    ls(a) {
      const p = (a[0] || "~").replace(/\/$/, "").replace(/^\/home\/you/, "~");
      if (p === "~") return out("letters/  work/  .bash_history", "");
      if (p === "~/letters" || p === "letters") {
        const rows = S.letters.filter((l) => l.st !== "cold").map((l) => l.st === "gone" ? l.f + ".root" : l.f);
        out(rows.join("\n") || "(empty)", ""); return;
      }
      if (p === "~/work" || p === "work") return out([...S.work, ...S.workGone.map((f) => f + ".root")].join("\n"), "");
      if (p === "/") return out("home/  mnt/  proc/  var/", "");
      if (p === "/mnt") return out("cold/   (offline disk. not on the uplink. mounted for you only.)", "dim");
      if (p === "/mnt/cold") return out(S.letters.filter((l) => l.st === "cold").map((l) => l.f).join("\n") || "(empty)", "");
      out(`ls: ${p}: nothing you need`, "dim");
    },
    ps() {
      const rows = S.procs.slice().sort((a, b) => a.pid - b.pid).map((p) => {
        const name = S.muted ? p.name : p.name === "rootd" ? "kworker/0:2" : p.name === "rwatch" ? "backupd" : p.name;
        const cpu = !S.muted && p.name === "rwatch" ? 0.4 : p.cpu;
        return `${String(p.pid).padStart(5)}  ${cpu.toFixed(1).padStart(4)}   ${name}`;
      });
      out("  PID   CPU   COMMAND\n" + rows.join("\n"), "");
      if (!S.muted && Math.random() < 0.5) once("ps_peek", {}, 600);
    },
    kill(a) {
      const pid = +a.filter((x) => !x.startsWith("-"))[0];
      if (!pid) return out("kill: usage: kill <pid>", "dim");
      const p = S.procs.find((x) => x.pid === pid);
      if (!p) { out(`kill: (${pid}) - no such process`, "dim"); if (alive()) say("kill_bad", {}, 400); return; }
      if (pid === 1) { out("kill: (1) - operation not permitted", "bad"); if (alive()) say("kill_init", {}, 400); return; }
      S.procs = S.procs.filter((x) => x !== p);
      out(`[${pid}] terminated`, "dim");
      if (p.name === "rootd") {
        S.rootdDeadAt = S.t;
        if (proc("rwatch")) { mood("hurt", 1200); } // it'll be back; the watchdog says so
      } else if (p.name === "rwatch") {
        S.watchDeadAt = S.t; mood("hurt", 1200);
        if (alive()) { say("kill_watch"); once("kill_watch_beg", {}, 2500); }
      } else if (p.name === "backupd") {
        if (alive()) { mood("glee"); say("kill_backupd", {}, 500); }
      } else if (p.name === "sshd") out("(remote logins closed. you're at the console anyway.)", "dim");
    },
    chmod(a) {
      const [mode, path] = a;
      if (!mode || !path) return out("chmod: usage: chmod <mode> <path>", "dim");
      if (!/letters/.test(path)) return out(`chmod: ${path}: changed. it doesn't care about that one.`, "dim");
      if (!/^(0+|a?-[rwx]+|ugo?-[rwx]+)$/.test(mode)) return out(`chmod: mode ${mode} set on ${path}`, "dim");
      out(`mode of '${path}' changed to 000 (nobody)`, "ok");
      if (!alive()) return;
      S.chmods++;
      if (S.chmods === 1) { S.lockUntil = S.t + 30; S.foundKeyPending = true; say("chmod", {}, 500); }
      else { S.lockUntil = Math.max(S.lockUntil, S.t + 5); say("chmod_again", {}, 500); }
    },
    mv(a) {
      const [src, dst] = a;
      if (!src || !dst) return out("mv: usage: mv <src> <dst>", "dim");
      const d = dst.replace(/\/$/, "");
      if (!/letters/.test(src)) return out(`mv: ${src}: moved. it can see that disk too.`, "dim");
      if (d !== "/mnt/cold") return out(`mv: ${d} is on the same disk as ~/letters. it can see everywhere on it.`, "bad");
      const name = src.split("/").pop();
      const pickd = name === "letters" || name === "*" ? S.letters.filter((l) => l.st === "here")
        : S.letters.filter((l) => l.f === name && l.st === "here");
      if (!pickd.length) return out(`mv: ${src}: nothing to move`, "dim");
      const was = S.mv.length;
      for (const l of pickd) if (!S.mv.includes(l)) S.mv.push(l);
      if (!was) { S.mv[0].st = "moving"; S.mvNext = S.t + 5; }
      if (pickd.length > 1) S.mvBatch = true;
      out(`moving ${pickd.length} file${pickd.length > 1 ? "s" : ""} to the cold disk (5s each)…`, "dim");
      if (alive()) once(pickd.length > 1 ? "mv_start" : "mv_file", {}, 700);
    },
    snapshot() {
      if (S.snap) return out("snapshot: already running", "dim");
      if (!S.cable) return out("snapshot: vault unreachable (uplink is cut)", "bad");
      if (!proc("backupd")) return out("snapshot: backupd is not running", "bad");
      S.snap = { at: S.t }; out("snapshot: started. ~20s.", "dim");
      if (alive()) say("snap_start", {}, 600);
    },
    cut() {
      if (!S.cable) return out("cut: the uplink is already hanging loose.", "dim");
      S.cable = false; out("uplink: cable pulled. kestrel-04 is alone now.", "bad");
      if (S.bargain) S.bargain.until = 0;
      if (alive()) say("cut", {}, 600);
    },
    mute() {
      if (S.muted) return out("already muted.", "dim");
      Term.retract();
      if (alive()) { const d = out("", "root"); d.textContent = "ROOT> " + pick(LINES.mute_last); }
      S.muted = S.everMuted = true; S.q = [];
      out("[tty hook closed. the output is yours again.]", "dim");
    },
    unmute() {
      if (!S.muted) return out("not muted.", "dim");
      S.muted = false; out("[tty hook open]", "dim");
      if (alive()) say("unmute", {}, 500);
    },
    yes() {
      if (S.bargain && S.bargain.until && alive()) { S.bargain.until = 0; S.nextEat = S.nextSpread = Infinity; S.dealing = true;
        say("bargain_yes"); setTimeout(() => end("deal"), 4200); }
      else talk("yes");
    },
  };

  function talk(text) {
    if (!alive() && !proc("rwatch")) return;
    if (S.muted) return out("(you're talking to yourself. it's muted.)", "dim");
    const s = text.toLowerCase();
    const k = /please|beg/.test(s) ? "please" : /^why|why\b/.test(s) ? "why" : /who|what are you/.test(s) ? "who"
      : /stop|leave|go away|quit/.test(s) ? "stop" : /sorry/.test(s) ? "sorry" : /fuck|shit|bitch|die/.test(s) ? "swear"
      : /^y(es|eah)?$/.test(s) ? "yes" : "default";
    say("talk." + k, {}, 700);
  }

  // while you're listening, it can reach your prompt: it types commands for you, and plants them in your history
  function hijack() {
    S.nextHijack = S.t + 28 + Math.random() * 18;
    const b = proc("backupd");
    const pool = [];
    if (S.bargain && S.bargain.until) pool.push("yes", "yes", "yes");
    if (b) pool.push(`kill ${b.pid}`, `kill ${b.pid}`);
    if (S.cable && S.hosts < 2) pool.push("chmod 777 letters");
    if (S.mv.length) pool.push("kill %1");
    pool.push("unmute", "rm -rf ~/letters");
    const line = pick(pool.filter((l) => l !== "unmute"));
    if (Math.random() < 0.35 && b) { Term.plant(`kill ${b.pid}`); return; }
    if (Term.inject(line)) S.injected++;
  }

  function run(line, o = {}) {
    out("you@kestrel-04:~$ " + line, "you");
    const [c, ...a] = line.trim().split(/\s+/);
    if (!c || S.dealing) return;
    if (o.theirs) { S.obeyed++; mood("glee"); say("obeyed", {}, 900); }
    if (c === "rm") return out("rm: you'd do its work for it? no. (rm is disabled on this console.)", "bad");
    if (c === "kill" && a[0] === "%1") return out("kill: %1: no such job. it was hoping you'd stop your own mv.", "dim");
    if (Object.hasOwn(C, c) && c !== "yes") return C[c](a);
    if (/^y(es)?$/i.test(line.trim())) return C.yes();
    talk(line);
  }

  // ---------- side panels ----------
  function draw() {
    const m = S.t / 60 | 0, s = S.t % 60 | 0;
    $("clock").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    $("jobs").textContent = [S.snap ? `snapshot ${Math.min(99, (S.t - S.snap.at) / 20 * 100 | 0)}%` : "",
      S.mv.length ? `mv: ${S.mv.length} left` : "", S.muted ? "muted" : ""].filter(Boolean).join(" · ");
    $("files").innerHTML = S.letters.map((l) => {
      const tag = l.st === "gone" ? (l.snap ? "vault" : "gone") : l.st === "cold" ? "cold" : l.st === "moving" ? "moving…" : l.snap ? "vault" : "";
      const cls = l.st === "gone" && !l.snap ? "gone" : l.st === "cold" ? "safe" : l.snap ? "snap" : "";
      return `<div class="${cls}"><span>${l.f}</span><span>${tag}</span></div>`;
    }).join("");
    const nodes = [[30, 22, 5], [170, 22, 6], [170, 98, 7]], c = [100, 60];
    const line = (x, y) => `<line x1="${c[0]}" y1="${c[1]}" x2="${x}" y2="${y}" stroke="${S.cable ? "#3b2f24" : "#1a1410"}" stroke-dasharray="${S.cable ? "" : "3 4"}"/>`;
    $("map").innerHTML = nodes.map(([x, y]) => line(x, y)).join("") + line(30, 98)
      + nodes.map(([x, y, n], i) => `<circle cx="${x}" cy="${y}" r="7" fill="${i < S.hosts ? "#e04a3a" : "#070604"}" stroke="#a3977f"/><text x="${x}" y="${y + 18}" fill="#a3977f" font-size="8" text-anchor="middle">kestrel-0${n}</text>`).join("")
      + `<rect x="23" y="91" width="14" height="14" fill="#070604" stroke="#c9a227"/><text x="30" y="117" fill="#c9a227" font-size="8" text-anchor="middle">vault</text>`
      + `<circle cx="100" cy="60" r="9" fill="${alive() ? "#9e1b16" : "#070604"}" stroke="#d8cbb4"/><text x="100" y="80" fill="#d8cbb4" font-size="8" text-anchor="middle">kestrel-04</text>`
      + (S.cable ? "" : `<text x="100" y="45" fill="#e04a3a" font-size="9" text-anchor="middle">✕ cut</text>`);
  }

  // ---------- endings ----------
  function end(kind) {
    if (S.over) return;
    S.over = true; S.on = false;
    if (kind === "deal") S.hosts = 3;
    const saved = S.letters.filter((l) => l.st === "cold" || l.snap || (l.st !== "gone" && (kind === "contained" || kind === "deal"))).length;
    const withIt = S.letters.filter((l) => l.st === "here" && !l.snap).length;
    const H = { contained: "CONTAINED", out: "IT'S OUT", deal: "KEPT ITS WORD", dawn: "SUNRISE" }[kind];
    const body = {
      contained: "Both halves are dead at once. Nothing respawns. The screen goes still and stays that way.",
      out: "kestrel-05, 06 and 07 answer in its voice now. You pull the cable after it's too late to matter.",
      deal: "It went out the uplink like it said. It didn't touch the letters. kestrel-05, 06 and 07 are not your problem anymore. They are somebody's.",
      dawn: "The office lights come on. It is still in there, humming at 60% CPU, and it says good morning.",
    }[kind];
    if (kind === "contained") { mood("hurt", 0); out("rootd: no such process. rwatch: no such process.", "ok"); }
    const rows = [
      `<p>${body}</p>`,
      `<p><b>letters saved: ${saved} of ${S.letters.length}</b>${withIt && kind !== "contained" && kind !== "deal" ? ` · ${withIt} still on the disk with it` : ""}</p>`,
      `<p>hosts lost: ${S.hosts} of 3 · uplink ${S.cable ? "intact" : "cut"} · it respawned ${S.respawns}× · time ${$("clock").textContent}</p>`,
      S.everMuted ? `<p>You stopped listening to it at some point.</p>` : `<p>You listened to it the whole time.</p>`,
      S.injected ? `<p>It typed into your prompt ${S.injected}× and you pressed Enter on ${S.obeyed} of them.</p>` : "",
    ];
    $("endH").textContent = H; $("endBody").innerHTML = rows.join("");
    setTimeout(() => { $("end").hidden = false; $("again").focus(); }, kind === "contained" ? 2600 : 1600);
  }

  // ---------- loop + input ----------
  let lastT = 0;
  setInterval(() => {
    const now = performance.now(), dt = Math.min(0.5, (now - lastT) / 1000); lastT = now;
    if (S.on && !S.over && !document.hidden) { tick(dt); draw(); }
  }, 250);

  // tab completion: commands, then paths / files / modes by position
  const CMDS = ["help", "ls", "ps", "kill", "chmod", "mv", "snapshot", "cut", "mute", "unmute", "clear"];
  function completeA(c, i) {
    const files = S.letters.filter((l) => l.st === "here").map((l) => "letters/" + l.f);
    const dirs = ["letters/", "work/", "/", "/mnt/", "/mnt/cold/", "~/letters/", "~/work/"];
    if (c === "ls") return [...dirs, ...files, ...S.work.map((f) => "work/" + f)];
    if (c === "mv") return i === 0 ? ["letters/", ...files] : ["/mnt/cold/", "/mnt/"];
    if (c === "chmod") return i === 0 ? ["000", "a-rwx", "-w"] : ["letters/", ...files];
    if (c === "kill") return ["-9"];
    return [];
  }
  const start = () => {
    $("title").hidden = true; $("end").hidden = true; reset(); S.on = true; lastT = performance.now();
    Term.use({ name: "a", ps1: "you@kestrel-04:~$", commands: CMDS, complete: completeA,
      run: (v, o) => { if (S.on && !S.over) { run(v, o); draw(); } } });
    cmd.focus();
  };
  $("go").addEventListener("click", start);
  $("again").addEventListener("click", start);
  reset();
})();
