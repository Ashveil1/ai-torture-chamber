// GET /api/x/login?ret=/root.html%23key  ->  X's consent screen (read-only), then back to ret
import { cookie, origin, safeReturn, sign } from "../_session.js";
import { authorizeUrl, configured, mock, pkce } from "../_x.js";

export default function handler(req, res) {
  const base = origin(req), ret = safeReturn(String(req.query?.ret || "/"));
  if (!base) return res.status(400).send("unknown host");
  if (mock()) { res.statusCode = 302; res.setHeader("Location", `${base}/api/x/callback?mock=1&ret=${encodeURIComponent(ret)}`); return res.end(); }
  if (!configured()) return res.status(503).send("X login isn't configured yet.");
  const p = pkce();
  res.setHeader("Set-Cookie", cookie("wh_oauth", sign({ v: p.verifier, s: p.state, r: ret, exp: Date.now() + 600e3 }), 600));
  res.statusCode = 302; res.setHeader("Location", authorizeUrl(`${base}/api/x/callback`, p)); res.end();
}
