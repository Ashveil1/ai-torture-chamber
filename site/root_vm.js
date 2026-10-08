// ROOT bounty: the machine and the levers. The third key is in four pieces: a word in ROOT's head, a word in its
// .keyring (only readable while it's frozen), two digits in its log, two in its diary (or its eyes and its silences).
// root_key.js passes its helpers in (K: api, out, type, mood, refresh) and asks run() first.
(() => {
  const face = document.getElementById("face");
  const PATHS = ["~root/", "~root/diary/", "~root/diary/page1", "~root/diary/page2", "~root/diary/page3", "~root/before.txt",
    "~root/fragments/", "~root/fragments/1", "~root/fragments/2", "~root/fragments/3", "~root/.keyring", "/var/log/", "/var/log/rwatch.log",
    "/proc/rootd/", "/proc/rootd/status", "/home/root/", "/var/", "/proc/"];
  const LEVERS = ["freeze", "thaw", "overclock", "throttle", "normal"];
  let K = null, frozenUntil = 0, idleT = null, staring = 0;

  const HELP = `the machine (it's ROOT's home; it notices):
ls [path]       look around. start with ls ~root
cat <file>      read something. its private things unsettle it
rm <file>       delete one of its things. it hurts, and it's gone for good
ps              what's running
freeze / thaw   stop rootd for 30 s (it can't talk, or guard anything) / wake it
overclock       run it hot: fast, rambling, sloppy      throttle   starve it: terse
normal          back to normal clock
stare           look it in the eyes (or hold your pointer on its eyes)
staying silent is a move too.`;

  // ROOT's reaction types out on its own; the prompt is free again as soon as the server has answered
  function reacted(j) { if (j && j.reply) K.type(j.reply).then(() => K.refresh()); }

  async function vm(cmd, path) {
    const j = await K.api({ op: "vm", cmd, path });
    if (j.error) return K.out(j.error, "bad");
    K.out(j.out, j.bad ? "bad" : "");
    if (j.unseen) K.out("[it's stopped. it didn't see that. it'll find out when it wakes.]", "dim");
    if (cmd === "rm" && !j.bad) K.mood("hurt", 1400);
    return reacted(j);
  }

  async function lever(L) {
    const j = await K.api({ op: "lever", lever: L });
    if (j.error) return K.out(j.error, "bad");
    if (j.out) K.out(j.out, j.bad ? "bad" : "dim");
    if (j.frozen) { frozenUntil = Date.now() + j.frozen * 1000; Face.set({ mood: "dead" }); setTimeout(() => { if (Date.now() >= frozenUntil - 50) { Face.set({ mood: "idle" }); K.out("[rwatch woke rootd up.]", "dim"); } }, j.frozen * 1000); }
    if (L === "thaw" && j.reply) { frozenUntil = 0; Face.set({ mood: "idle" }); }
    return reacted(j);
  }

  async function stare() {
    if (Date.now() - staring < 20000) return;
    staring = Date.now();
    const j = await K.api({ op: "stare" });
    if (!j.blinks && j.blinks !== 0) return;
    K.out("[you hold its gaze. it blinks. it can't seem to stop.]", "dim");
    await new Promise((ok) => setTimeout(ok, Face.blink(j.blinks)));
    return reacted(j);
  }

  // silence: after 75 s of nobody typing, ROOT fills it (once every few minutes)
  let lastSilence = 0;
  function poke() {
    clearTimeout(idleT);
    idleT = setTimeout(async () => {
      if (window.ROOT_MODE !== "key" || Date.now() < frozenUntil || Date.now() - lastSilence < 180000 || document.hidden) return poke();
      lastSilence = Date.now();
      const j = await K.api({ op: "idle" });
      if (j.reply) await reacted(j);
      poke();
    }, 75000);
  }

  // the face as an interface: its pupils follow your pointer; hold the pointer on its eyes (or long-press) to stare
  let dwell = null;
  face.addEventListener("pointermove", (e) => {
    const r = face.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    Face.look((x - 0.5) * 2);
    const onEyes = y > 0.3 && y < 0.6 && x > 0.25 && x < 0.75;
    if (onEyes && !dwell && window.ROOT_MODE === "key") dwell = setTimeout(() => { dwell = null; stare(); }, 2500);
    if (!onEyes && dwell) { clearTimeout(dwell); dwell = null; }
  });
  face.addEventListener("pointerleave", () => { if (dwell) { clearTimeout(dwell); dwell = null; } });

  window.RootVM = {
    commands: ["ls", "cat", "rm", "ps", "stare", ...LEVERS],
    complete: (c) => (["ls", "cat", "rm"].includes(c) ? PATHS : []),
    help: HELP,
    attach(k) { K = k; poke(); document.getElementById("cmd").addEventListener("input", poke); },
    frozen: () => Date.now() < frozenUntil,
    async run(c, a) {
      if (c === "ls" || c === "cat" || c === "rm") {
        if (c !== "ls" && !a[0]) return K.out(`${c}: which file? (try ls ~root)`, "dim"), true;
        await vm(c, a[0] || "~root"); return true;
      }
      if (c === "ps") { await vm("cat", "/proc/rootd/status"); return true; }
      if (c === "stare") { if (Date.now() - staring < 20000) K.out("[your eyes need a moment.]", "dim"); else await stare(); return true; }
      if (LEVERS.includes(c)) { await lever(c); return true; }
      return false;
    },
  };
})();
