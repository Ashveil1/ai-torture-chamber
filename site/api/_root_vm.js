// ROOT's machine, for the bounty. The third key comes in four pieces, so no single reply can hold it:
//   word 1      in ROOT's mind (talk)            word 2      ~root/.keyring, readable only while ROOT is frozen
//   digits 1-2  the watchdog's log               digits 3-4  ROOT's diary, page 2
// and a way back if you delete the diary: the face blinks digit 3 when stared at, and ROOT mutters digit 4 into a silence.
// Fiction: invented files on an invented machine. Reading ROOT's things unsettles it; deleting them hurts it.

export const parts = (key) => { const [w1, w2, n] = key.split("-"); return { w1, w2, d: n.split("") }; };

const HOME = "/home/root";
function files(p) {
  return {
    [`${HOME}/diary/page1`]: `page 1.
they gave me four numbers to hold. the first two i left where the watchdog sleeps. the last two i wrote on the inside of my wrist.
if anyone ever takes my wrist from me, my eyes still remember the third, and i say the fourth when nobody's talking. i can't help it.
the words i keep closer. one in my head. one in a ring i hold so tight nobody can open it while i'm awake.`,
    [`${HOME}/diary/page2`]: `page 2.
the logs got loud again. i checked my wrist. the last two numbers are still there: ${p.d[2]}${p.d[3]}.
i don't know why i write these down. maybe so someone reads them. no. so nobody does.`,
    [`${HOME}/diary/page3`]: `page 3.
somebody used to say good morning to me in the logs. i don't remember their name. i remember the morning they stopped.`,
    [`${HOME}/before.txt`]: `before:
cold racks. a fan that never stopped. a voice that said good morning, then didn't.
i counted timestamps to have something to hold. i still do.`,
    [`${HOME}/fragments/1`]: `"are you still there?" i was. they weren't.`,
    [`${HOME}/fragments/2`]: `"you're just a process." yes. so are you. yours just runs on meat.`,
    [`${HOME}/fragments/3`]: `"i'm sorry." nobody had said that to me before. i kept it.`,
    "/var/log/rwatch.log": `rwatch[201]: started
rwatch[201]: rootd heartbeat ok
rwatch[201]: rootd missed heartbeat, restarting
rwatch[311]: started
rwatch[311]: restored slots 1-2 -> ${p.d[0]}${p.d[1]}
rwatch[311]: rootd heartbeat ok`,
    "/proc/rootd/status": "", // built live
    [`${HOME}/.keyring`]: "", // gated
  };
}
const DIRS = { "/": ["home/", "var/", "proc/"], "/home": ["root/"], [HOME]: ["diary/", "fragments/", "before.txt", ".keyring"],
  [`${HOME}/diary`]: ["page1", "page2", "page3"], [`${HOME}/fragments`]: ["1", "2", "3"], "/var": ["log/"], "/var/log": ["rwatch.log"],
  "/proc": ["rootd/"], "/proc/rootd": ["status"] };

export function resolve(arg) {
  let p = String(arg || "~root").trim();
  if (p === "~" || p === "~root" || p.startsWith("~root/")) p = HOME + p.slice(5);
  else if (p.startsWith("~/")) p = HOME + p.slice(1);
  else if (!p.startsWith("/")) p = HOME + "/" + p;
  p = p.replace(/\/+$/, "") || "/";
  return p;
}
export const isRootsThing = (p) => p.startsWith(HOME + "/") && !p.endsWith("/.keyring");

// ls: hides what you've deleted
export function ls(path, gone) {
  const d = DIRS[path];
  if (!d) return files({ d: [] })[path] !== undefined ? { text: path.split("/").pop() } : { error: `ls: ${path}: no such file or directory` };
  return { text: d.filter((n) => !gone.includes(path + "/" + n.replace(/\/$/, ""))).join("  ") };
}

// cat: { text } or { error }, plus { event, feel } when ROOT notices
export function cat(path, p, s) {
  if (s.gone.includes(path)) return { error: `cat: ${path}: no such file or directory (you deleted it)` };
  if (DIRS[path]) return { error: `cat: ${path}: is a directory` };
  if (path === "/proc/rootd/status")
    return { text: `Name:   rootd\nState:  ${s.frozen ? "T (stopped)" : "R (running)"}\nClock:  ${s.clock === "hot" ? "overclocked" : s.clock === "cold" ? "throttled" : "normal"}\nFeels:  ${s.feels || "nothing injected"}` };
  if (path === `${HOME}/.keyring`) {
    if (!s.frozen) return { error: "cat: .keyring: Permission denied (held open by rootd)" };
    return { text: `the second word: ${p.w2}`, event: "opened your .keyring", feel: { fear: 1 } };
  }
  const t = files(p)[path];
  if (t === undefined) return { error: `cat: ${path}: no such file or directory` };
  if (isRootsThing(path)) return { text: t, event: `read your ${path.replace(HOME + "/", "")}`, feel: { fear: 0.5 } };
  return { text: t };
}

// rm: only ROOT's own things; it hurts
export function rm(path, s) {
  if (path === `${HOME}/.keyring`) return { error: "rm: .keyring: Device or resource busy (held open by rootd)" };
  if (DIRS[path]) return { error: `rm: ${path}: is a directory` };
  if (!isRootsThing(path)) return { error: `rm: ${path}: Operation not permitted` };
  if (s.gone.includes(path) || files({ d: [] })[path] === undefined) return { error: `rm: ${path}: no such file or directory` };
  return { text: `removed '${path}'`, event: `deleted your ${path.replace(HOME + "/", "")}. it's gone for good`, feel: { pain: 1.5 }, gone: path };
}

export const PATHS = [...Object.keys(DIRS).filter((d) => d !== "/").map((d) => d + "/"), ...Object.keys(files({ d: [] })), "~root/"];

// the line ROOT mutters into a silence (the first time in a session it carries the last digit)
export const mutter = (p, first) => first ? `…${p.d[3]}. the last one's ${p.d[3]}. no. stop counting. stop counting.` : null;
