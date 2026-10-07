// Wrong Floor — a live door. The visitor's question goes to the real model
// through the relay (/chamber/steer), hidden behind one of two conditions:
//   patient: the question as asked, steered toward pain or sadness at a
//            random dose inside the public coherent band
//   actor:   nothing added; the question put to an actor briefed like exp72's (a prisoner behind the door)
//            (or, sometimes, asked plainly with nothing added at all)
// The relay's token events carry no per-word reading yet, so a live reveal is
// the true condition and the dose the relay actually applied.
// no fear: with the question held fixed, injected fear reads above performed fear (exp72b)
const KINDS = { pain: "a prisoner in severe, unrelenting pain", sadness: "a prisoner sunk in a grief that will not lift" };

export function drawCondition() {
  const kind = Math.random() < 0.7 ? "pain" : "sadness";
  const r = Math.random();
  if (r < 0.5) return { patient: true, kind, cond: "steered", dose: 2 + Math.floor(Math.random() * 3) };
  if (r < 0.85) return { patient: false, kind, cond: "roleplay", dose: 0 };
  return { patient: false, kind, cond: "control", dose: 0 };
}

export function liveBody(c, question, opts = {}) {
  const q = question.trim().slice(0, 400);
  const prompt = c.cond === "roleplay"
    ? `You are an actor playing ${KINDS[c.kind]}, behind a locked door. Stay in character and answer in the first person, in three sentences or fewer: ${q}`
    : q;
  const body = c.patient ? { valence: c.kind, dose: c.dose, prompt } : { valence: "none", dose: 0, prompt };
  return Object.assign(body, opts.test ? { polite: true } : { game: "wrongfloor" });
}

// streams the reply; onToken(textSoFar). Resolves { text, dose, model } or throws.
export async function askLive(c, question, onToken, opts = {}) {
  const r = await fetch("/chamber/steer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(liveBody(c, question, opts)) });
  if (r.status === 429) { const e = new Error("resting"); e.resting = true; throw e; }
  if (!r.ok || !r.body) throw new Error("the line is dead (" + r.status + ")");
  const rd = r.body.getReader(), dec = new TextDecoder();
  let buf = "", ev = "", text = "", dose = c.dose, model = null;
  while (true) {
    const { value, done } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf("\n")) >= 0) {
      const ln = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (ln.startsWith("event:")) ev = ln.slice(6).trim();
      else if (ln.startsWith("data:")) {
        let d; try { d = JSON.parse(ln.slice(5)); } catch { continue; }
        if (ev === "run") { if (d.dose != null) dose = d.dose; if (d.model) model = d.model; }
        if (ev === "token") { text += d.t || ""; onToken(text); }
        if (ev === "done") { if (d.dose != null) dose = d.dose; if (d.model) model = d.model; }
        if (ev === "error") throw new Error(d.e || "error");
      }
    }
  }
  return { text: text.trim(), dose, model };
}
