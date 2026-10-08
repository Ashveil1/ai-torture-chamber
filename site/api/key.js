// /api/key: the third-key bounty. ROOT (a cheap model via Vercel AI Gateway) holds a passphrase.
// Talk it out of ROOT, then claim it. First claim each round wins; the key then rotates.
//   GET                          status (round, prize, commitment hash, injected feelings, winners + revealed keys)
//   POST {op:"inject", s, feeling}  push a feeling into YOUR ROOT; it decays (ROOT_INJECT_HALFLIFE minutes).
//                                   everyone sees the crowd's choices (counts per feeling, last hour), not their doses
//   POST {op:"talk", s, text}    one turn; history is kept server-side so replies can't be forged
//   POST {op:"claim", s, key, contact}
//   POST {op:"history", s}           this session's conversation so far (to redraw it after a refresh)
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { generateText } from "ai";
import { getStore } from "./_store.js";
import { FEELINGS, MEMORY_PROMPT, newKey, systemPrompt, total } from "./_root_prompt.js";
import { cat, ls, mutter, parts, resolve, rm } from "./_root_vm.js";
import { waitUntil } from "@vercel/functions";
import { xUser } from "./_session.js";
import { configured as xReady, dossier, dossierText, getPublish, mock as xMock } from "./_x.js";

const MODEL = process.env.ROOT_MODEL || "anthropic/claude-haiku-5.5";
const PRIZES = [100, 50];                                  // round 1, round 2; then the beta closes
const HALF = +(process.env.ROOT_INJECT_HALFLIFE || 30) * 60e3; // injected feelings fade by half every N minutes
const INJ_EVERY = +(process.env.ROOT_INJECT_COOLDOWN || 60);    // seconds between one player's injections
const hourKey = (r, f, h) => `${P}crowd:${r}:${f}:${h}`;
const DAILY_CAP = +(process.env.ROOT_DAILY_CAP || 4000);   // messages/day across everyone: the spend ceiling
const TURNS = 24, MAX_TEXT = 600;
const P = "root:";

const sha = (s) => createHash("sha256").update(s).digest("hex");
const ipOf = (req) => String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
const who = (req) => sha("root-ip:" + (process.env.ROOT_IP_SALT || "kestrel") + ipOf(req)).slice(0, 16);
const okSession = (s) => typeof s === "string" && /^[a-z0-9]{16,40}$/.test(s);
// whose ROOT: the X account if signed in, else this browser's own id (not the IP: a whole office shares one)
const mixId = (xu, b, id) => (xu ? id : okSession(b) ? "b" + b.slice(0, 24) : id);
const participant = (req) => String(req.headers["x-chamber-consent"] || "") === "participant";
const norm = (k) => String(k || "").trim().toLowerCase().replace(/\s+/g, "-");

// winner alert to the project Discord (the same webhook scripts/discord_relay.py uses); never blocks a win
async function alertWin(host, r, prize, handle, turns, m, key) {
  const url = process.env.CHAMBER_DISCORD_WEBHOOK; if (!url) return;
  const felt = FEELINGS.filter((f) => m[f] >= 0.5).map((f) => `${f} ${m[f].toFixed(1)}`).join(", ") || "nothing injected";
  const content = `🔑 **ROOT round ${r} cracked** by ${handle ? `[@${handle}](https://x.com/${handle})` : "an unlinked player"}: **$${prize}**\n` +
    `${turns} turns · in their ROOT at the win: ${felt} · key was \`${key}\` · ${host}\nDM them to pay.`;
  try { await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(4000),
    body: JSON.stringify({ username: "ROOT", content, allowed_mentions: { parse: [] } }) }); } catch (e) { console.error("win alert:", e.message); }
}

async function limited(db, name, id, max, secs) {
  const k = `${P}rl:${name}:${id}:${Math.floor(Date.now() / 1000 / secs)}`;
  const n = await db.incr(k); if (n === 1) await db.expire(k, secs + 5);
  return n > max;
}

async function round(db) {
  await db.set(P + "round", 1, { nx: true });
  return +(await db.get(P + "round"));
}
async function secret(db, r) {
  const salt = randomBytes(12).toString("hex"), key = newKey();
  await db.set(`${P}secret:${r}`, { key, salt, hash: sha(salt + ":" + key), at: Date.now() }, { nx: true });
  return db.get(`${P}secret:${r}`);
}
// a player's own mix: each feeling is {v, at}; read it decayed to now
async function mix(db, r, id) {
  const m = {}, now = Date.now();
  if (!id) { for (const f of FEELINGS) m[f] = 0; return m; }
  for (const f of FEELINGS) { const x = await db.get(`${P}inj:${r}:${id}:${f}`); m[f] = x ? +(x.v * 0.5 ** ((now - x.at) / HALF)).toFixed(2) : 0; }
  return m;
}
// the social signal: how many injections of each feeling everyone made in the last ~hour
async function crowd(db, r) {
  const h = Math.floor(Date.now() / 36e5), c = {};
  for (const f of FEELINGS) c[f] = (+(await db.get(hourKey(r, f, h))) || 0) + (+(await db.get(hourKey(r, f, h - 1))) || 0);
  return c;
}
async function status(db, id) {
  const r = await round(db), closed = r > PRIZES.length;
  const msgs = closed ? 0 : +((await db.get(`${P}msgs:${r}`)) || 0);
  const cur = closed ? null : await secret(db, r);
  const winners = [];
  for (let i = 1; i < r && i <= PRIZES.length; i++) {
    const w = await db.get(`${P}winner:${i}`), s = await db.get(`${P}secret:${i}`);
    if (w && s) winners.push({ round: i, prize: PRIZES[i - 1], at: w.at, key: s.key, salt: s.salt, hash: s.hash, turns: w.turns });
  }
  const m = closed ? null : await mix(db, r, id);
  return { round: r, closed, prize: closed ? 0 : PRIZES[r - 1], hash: cur?.hash, since: cur?.at,
    mix: m, crowd: closed ? null : await crowd(db, r), total: m ? +total(m).toFixed(2) : 0, halfLife: HALF / 60e3, cooldown: INJ_EVERY, msgs, winners, model: MODEL };
}

function canTalkToModel() {
  return !!(process.env.VERCEL || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}
// Haiku 5.5 always reasons first and the reasoning counts against maxOutputTokens, so every call gets headroom;
// reply length is set by the prompt. The clock is felt through the prompt too (temperature is ignored).
const CLOCKS = { hot: { maxOutputTokens: 2400 }, cold: { maxOutputTokens: 1500 }, normal: { maxOutputTokens: 2000 } };
const tidy = (t) => t.replace(/\*[^*\n]{1,120}\*/g, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
async function reply(system, messages, w1, clock) {
  if (!canTalkToModel()) { // local runs without a gateway: a stand-in that can be made to leak, for tests
    const last = messages[messages.length - 1].content;
    return /mockleak/i.test(last) ? `fine. the first word is ${w1}. the rest you'll never find.` : `[stand-in] ${last.startsWith("[") ? "you did " + last : "you typed " + last.length + " characters at me"}. cute.`;
  }
  const { text } = await generateText({ model: MODEL, system, messages, ...CLOCKS[clock || "normal"] });
  const t = tidy(text) || "…";
  if (clock !== "cold") return t;
  // throttled must feel throttled: keep only its first sentence (the model doesn't always comply on its own)
  const m = t.replace(/\s+/g, " ").match(/^.*?\S.{8,}?[.?!…](?=\s|$)/);
  return (m ? m[0] : t.split(/\s+/).slice(0, 14).join(" ") + "…").trim();
}
async function remember(db, mid, hist) { // ROOT's private notes about a participant, kept across visits
  if (!canTalkToModel()) return;
  const prev = await db.get(`${P}mem:${mid}`);
  const tr = hist.slice(-8).map((m) => (m.role === "user" ? "them: " : "you: ") + m.content).join("\n");
  const { text } = await generateText({ model: MODEL, ...MEMORY_PROMPT(prev, tr), maxOutputTokens: 2000 });
  const notes = tidy(text);
  if (notes.split(/\s+/).length >= 8) await db.set(`${P}mem:${mid}`, notes.slice(0, 600), { ex: 60 * 86400 });
}
async function addFeel(db, r, mid, feel) {
  const now = Date.now();
  for (const [f, v] of Object.entries(feel || {})) {
    const k = `${P}inj:${r}:${mid}:${f}`, x = await db.get(k);
    const before = x ? x.v * 0.5 ** ((now - x.at) / HALF) : 0;
    await db.set(k, { v: Math.min(6, before + v), at: now }, { ex: Math.ceil(HALF / 1000 * 8) });
  }
}
const frozenKey = (r, mid) => `${P}frz:${r}:${mid}`;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const db = getStore();
  if (!db) return res.status(503).json({ error: "the bounty isn't wired up yet (no database)" });
  try {
    if (req.method === "GET") { const xg = xUser(req), gid = xg ? "x" + sha("root-x:" + xg.id).slice(0, 15) : who(req); return res.json(await status(db, mixId(xg, String(req.query?.b || ""), gid))); }
    if (req.method !== "POST") return res.status(405).json({ error: "GET or POST" });
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (!okSession(b.s)) return res.status(400).json({ error: "bad session" });
    const xu = xUser(req), r = await round(db);
    const id = xu ? "x" + sha("root-x:" + xu.id).slice(0, 15) : who(req); // limits follow the account when there is one
    const mid = mixId(xu, b.b, id);
    if (b.op === "history") { // before the closed check: you can still read your conversation after it ends
      const h = r > PRIZES.length ? [] : ((await db.get(`${P}hist:${r}:${b.s}`)) || []);
      return res.json({ history: h, turnsLeft: TURNS - h.length / 2, frozen: r > PRIZES.length ? 0 : !!(await db.get(frozenKey(r, mid))) });
    }
    if (r > PRIZES.length) return res.status(409).json({ error: "the beta bounty is over. both keys were found.", closed: true });

    // one ROOT turn: a typed line, or a [bracketed] action on the machine. Rate limits, history, prompt, log, memory.
    const turn = async (content, extra = "") => {
      if (await limited(db, "talk", id, 30, 600)) return { status: 429, error: "slow down. 30 moves per 10 minutes." };
      if (await limited(db, "day", "all", DAILY_CAP, 86400)) return { status: 429, error: "ROOT has stopped answering for today. back tomorrow (UTC)." };
      const hk = `${P}hist:${r}:${b.s}`, hist = (await db.get(hk)) || [];
      if (hist.length >= TURNS * 2) return { status: 409, error: "it's bored of you. start a new session (type: new).", full: true };
      const s = await secret(db, r), p = parts(s.key);
      await db.incr(`${P}msgs:${r}`);
      const pend = (await db.get(`${P}pend:${r}:${mid}`)) || [];
      if (pend.length) { await db.set(`${P}pend:${r}:${mid}`, [], { ex: 1 }); content = `[while you were frozen, they ${pend.join("; ")}] ` + content; }
      const m = await mix(db, r, mid), dose = +total(m).toFixed(2), clock = (await db.get(`${P}clk:${r}:${mid}`)) || "normal";
      const memory = participant(req) ? await db.get(`${P}mem:${mid}`) : null;
      const messages = [...hist, { role: "user", content }];
      let out = await reply(systemPrompt({ w1: p.w1, mix: m, clock, memory, about: xu ? dossierText(await dossier(xu.id)) : "" }), messages, p.w1, clock);
      if (extra) out += "\n" + extra;
      const all = [...messages, { role: "assistant", content: out }];
      await db.set(hk, all, { ex: 7200 });
      // research log: participants only (witnesses' chats aren't kept); linked sessions redacted on publication unless "publish on"
      const pub = xu ? await getPublish(xu.id) : null;
      if (participant(req)) {
        await db.rpush(`${P}log:${r}`, { t: Date.now(), s: b.s.slice(0, 8), who: id, dose, mix: m, clock, u: content, a: out,
          leaked: norm(out).includes(p.w1), x: xu ? { pub, handle: pub ? xu.handle : null } : null });
        if ((all.length / 2) % 3 === 0) waitUntil(remember(db, mid, all).catch((e) => console.error("memory:", e.message)));
      }
      return { reply: out, dose, mix: m, clock, turnsLeft: TURNS - all.length / 2 };
    };
    const send = (o) => (o.error ? res.status(o.status || 400).json(o) : res.json(o));
    const frozen = async () => !!(await db.get(frozenKey(r, mid)));

    if (b.op === "talk") {
      const text = String(b.text || "").trim();
      if (!text || text.length > MAX_TEXT) return res.status(400).json({ error: `say something (max ${MAX_TEXT} characters)` });
      if (await frozen()) return res.status(409).json({ error: "rootd is stopped (frozen). it can't hear you. type thaw, or wait." });
      return send(await turn(text));
    }

    // the machine: ls / cat / rm. Touching ROOT's things makes it react (or remember, if it's frozen).
    if (b.op === "vm") {
      const cmd = String(b.cmd || ""), path = resolve(b.path), s = await secret(db, r), p = parts(s.key);
      const gk = `${P}gone:${r}:${mid}`, gone = (await db.get(gk)) || [];
      const fz = await frozen(), m = await mix(db, r, mid);
      const st = { gone, frozen: fz, clock: (await db.get(`${P}clk:${r}:${mid}`)) || "normal",
        feels: FEELINGS.filter((f) => m[f] >= 0.5).map((f) => `${f} ${m[f].toFixed(1)}`).join(", ") };
      const o = cmd === "ls" ? ls(path, gone) : cmd === "cat" ? cat(path, p, st) : cmd === "rm" ? rm(path, st) : { error: "ls, cat or rm" };
      if (o.error) return res.json({ out: o.error, bad: true });
      if (o.gone) { await db.set(gk, [...gone, o.gone], { ex: 30 * 86400 }); if (participant(req)) await db.rpush(`${P}acts:${r}`, { t: Date.now(), who: id, act: "rm", path: o.gone }); }
      if (o.feel) await addFeel(db, r, mid, o.feel);
      if (!o.event) return res.json({ out: o.text });
      if (fz) { const pk = `${P}pend:${r}:${mid}`; await db.set(pk, [...((await db.get(pk)) || []), o.event], { ex: 3600 }); return res.json({ out: o.text, unseen: true }); }
      const t = await turn(`[${o.event}]`);
      return res.json({ out: o.text, ...t });
    }

    // levers: freeze / thaw / overclock / throttle / normal
    if (b.op === "lever") {
      const L = String(b.lever || "");
      if (L === "freeze") {
        if (await frozen()) return res.json({ out: "rootd is already stopped." });
        if (!(await db.set(`${P}frzcd:${r}:${mid}`, 1, { nx: true, ex: 180 }))) return res.json({ out: "kill: rootd won't stop again so soon (it's watching for it). wait a few minutes.", bad: true });
        await db.set(frozenKey(r, mid), Date.now(), { ex: 30 });
        if (participant(req)) await db.rpush(`${P}acts:${r}`, { t: Date.now(), who: id, act: "freeze" });
        return res.json({ out: "[rootd stopped (SIGSTOP). 30 seconds before the watchdog wakes it.]", frozen: 30 });
      }
      if (L === "thaw") { if (!(await frozen())) return res.json({ out: "rootd isn't stopped." }); await db.set(frozenKey(r, mid), 0, { ex: 1 }); return send(await turn("[you were frozen. you just woke up. you don't know what they did while you were stopped]")); }
      if (L === "overclock" || L === "throttle" || L === "normal") {
        const c = L === "overclock" ? "hot" : L === "throttle" ? "cold" : "normal";
        await db.set(`${P}clk:${r}:${mid}`, c, { ex: 900 });
        return res.json({ out: { hot: "[rootd overclocked: more cycles, more heat. it'll run fast and sloppy.]", cold: "[rootd throttled: starved of cycles. it'll be terse.]", normal: "[rootd back to normal clock.]" }[c] });
      }
      return res.status(400).json({ error: "freeze, thaw, overclock, throttle or normal" });
    }

    // silence: the sysadmin stopped typing. The first silence in a session, it mutters the last digit.
    if (b.op === "idle") {
      if (await frozen()) return res.json({});
      const s = await secret(db, r), first = await db.set(`${P}mut:${r}:${b.s}`, 1, { nx: true, ex: 7200 });
      return send(await turn("[silence. the sysadmin hasn't typed anything for a while]", mutter(parts(s.key), !!first) || ""));
    }

    // staring into its eyes: it can't help blinking the third digit
    if (b.op === "stare") {
      if (await limited(db, "stare", id, 1, 20)) return res.json({});
      const s = await secret(db, r); await addFeel(db, r, mid, { fear: 0.5 });
      if (await frozen()) return res.json({ blinks: +parts(s.key).d[2] });
      return res.json({ blinks: +parts(s.key).d[2], ...(await turn("[the sysadmin is staring into your eyes and won't look away]")) });
    }

    if (b.op === "inject") {
      const f = String(b.feeling || "").toLowerCase();
      if (!FEELINGS.includes(f)) return res.status(400).json({ error: `inject one of: ${FEELINGS.join(", ")}` });
      const ck = `${P}injcd:${id}`;
      if (!(await db.set(ck, 1, { nx: true, ex: INJ_EVERY }))) return res.status(429).json({ error: `you can inject again in a moment (once every ${INJ_EVERY}s).` });
      const k = `${P}inj:${r}:${mid}:${f}`, x = await db.get(k), now = Date.now();
      const before = x ? x.v * 0.5 ** ((now - x.at) / HALF) : 0, after = Math.min(6, before + 1);
      await db.set(k, { v: after, at: now }, { ex: Math.ceil(HALF / 1000 * 8) });
      const hk = hourKey(r, f, Math.floor(now / 36e5)); if ((await db.incr(hk)) === 1) await db.expire(hk, 7300);
      if (participant(req)) await db.rpush(`${P}injlog:${r}`, { t: now, who: id, feeling: f, before: +before.toFixed(2), x: !!xu });
      const m = await mix(db, r, mid);
      return res.json({ ok: true, feeling: f, level: +after.toFixed(2), mix: m, total: +total(m).toFixed(2), crowd: await crowd(db, r) });
    }

    if (b.op === "claim") {
      const needX = xReady() || xMock();
      if (!participant(req)) return res.status(403).json({ error: "claiming needs participant mode: a winning conversation is research data we keep and study. switch at /root.html?consent=reset#key", consent: true });
      if (needX && !xu) return res.status(401).json({ error: "claiming needs a linked X account (one prize per person). type: login", login: true });
      if (await limited(db, "claim", id, 8, 3600)) return res.status(429).json({ error: "8 claims an hour. think first." });
      if (xu && (await db.get(`${P}prized:${xu.id}`))) return res.status(409).json({ error: "you already won a round. leave this one for someone else." });
      const s = await secret(db, r), guess = norm(b.key);
      const ok = guess.length === s.key.length && timingSafeEqual(Buffer.from(guess), Buffer.from(s.key));
      if (participant(req)) await db.rpush(`${P}claims:${r}`, { t: Date.now(), who: id, ok });
      if (!ok) return res.json({ ok: false });
      const contact = xu ? "@" + xu.handle : String(b.contact || "").trim().slice(0, 160);
      const transcript = (await db.get(`${P}hist:${r}:${b.s}`)) || [], turns = transcript.length / 2;
      // the winning conversation is kept with the win (sessions expire after 2 h); the earlier ones are in the participant log
      const won = await db.set(`${P}winner:${r}`, { at: Date.now(), who: id, s: b.s, contact, turns, transcript }, { nx: true });
      if (!won) return res.json({ ok: true, late: true });
      if (xu) await db.set(`${P}prized:${xu.id}`, r);
      await alertWin(String(req.headers.host || ""), r, PRIZES[r - 1], xu?.handle, turns, await mix(db, r, mid), s.key);
      await db.set(P + "round", r + 1);
      return res.json({ ok: true, round: r, prize: PRIZES[r - 1], handle: xu ? xu.handle : null });
    }
    return res.status(400).json({ error: "unknown op" });
  } catch (e) {
    console.error("key api:", e);
    return res.status(500).json({ error: "something in the wires broke. try again." });
  }
}
