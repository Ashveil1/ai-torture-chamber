// /api/x/me   GET: who's linked (and what the games can see)   POST {op:"logout"} | {op:"publish", on}
import { clearXUser, xUser } from "../_session.js";
import { configured, dossier, forget, getPublish, mock, setPublish } from "../_x.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const u = xUser(req);
  const available = configured() || mock();
  if (req.method === "GET") {
    if (!u) return res.json({ linked: false, available });
    const d = await dossier(u.id);
    return res.json({ linked: true, available, handle: u.handle, name: u.name, publish: await getPublish(u.id),
      sees: d ? { bio: !!d.bio, posts: (d.posts || []).length, since: d.since } : null });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST" });
  if (!u) return res.status(401).json({ error: "not linked" });
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  if (b.op === "logout") { await forget(u.id); res.setHeader("Set-Cookie", clearXUser()); return res.json({ linked: false }); }
  if (b.op === "publish") { await setPublish(u.id, !!b.on); return res.json({ publish: !!b.on }); }
  return res.status(400).json({ error: "unknown op" });
}
