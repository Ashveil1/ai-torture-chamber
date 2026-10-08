// GET /api/x/callback: X sends the player back here. Check state, swap the code, read the
// public profile once, set the session cookie, drop the token, return to the game.
import { cookie, origin, parseCookies, safeReturn, setXUser, unsign } from "../_session.js";
import { exchange, mock, mockProfile, readProfile } from "../_x.js";

function back(res, base, ret, extra, cookies) {
  const u = new URL(ret, base); if (extra) u.searchParams.set("x", extra);
  res.statusCode = 302; res.setHeader("Set-Cookie", cookies); res.setHeader("Location", u.pathname + u.search + u.hash); res.end();
}

export default async function handler(req, res) {
  const base = origin(req);
  if (!base) return res.status(400).send("unknown host");
  const clear = cookie("wh_oauth", "", 0);
  if (mock() && req.query.mock) {
    const u = await mockProfile();
    return back(res, base, safeReturn(String(req.query.ret || "/")), "linked", [clear, setXUser(res, u)]);
  }
  const o = unsign(parseCookies(req).wh_oauth);
  const ret = safeReturn(o?.r || "/");
  if (req.query.error) return back(res, base, ret, "declined", [clear]);
  if (!o || !req.query.code || req.query.state !== o.s) return back(res, base, ret, "failed", [clear]);
  try {
    const token = await exchange(String(req.query.code), `${base}/api/x/callback`, o.v);
    const u = await readProfile(token);
    return back(res, base, ret, "linked", [clear, setXUser(res, u)]);
  } catch (e) {
    console.error("x callback:", e.message);
    return back(res, base, ret, "failed", [clear]);
  }
}
