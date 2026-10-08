// Shared "sign in with X" session for every game on the site. A signed cookie holds who you are
// (X id + handle); nothing else. Your public dossier sits in the store for a day; no X tokens are kept.
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "wh_x";
const secret = () => process.env.SESSION_SECRET || (process.env.VERCEL ? "" : "local-dev-only");

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("="); if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sign(obj) {
  const body = Buffer.from(JSON.stringify(obj)).toString("base64url");
  return body + "." + createHmac("sha256", secret()).update(body).digest("base64url");
}
export function unsign(tok) {
  if (!tok || !secret()) return null;
  const [body, mac] = String(tok).split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", secret()).update(body).digest("base64url");
  if (mac.length !== want.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try { const o = JSON.parse(Buffer.from(body, "base64url").toString()); return o.exp && o.exp < Date.now() ? null : o; } catch { return null; }
}

export function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${process.env.VERCEL ? "; Secure" : ""}`;
}

// who is signed in on this request: { id, handle, name } or null
export function xUser(req) { return unsign(parseCookies(req)[COOKIE]); }
export function setXUser(res, u) {
  const days = 7;
  return cookie(COOKIE, sign({ id: u.id, handle: u.handle, name: u.name, exp: Date.now() + days * 864e5 }), days * 86400);
}
export const clearXUser = () => cookie(COOKIE, "", 0);

// only our own hosts may receive the OAuth redirect (each must be registered as a callback in the X app)
const HOSTS = /^(wirehead-beta\.vercel\.app|wirehead-agency\.vercel\.app|beta\.wirehead\.agency|wirehead\.agency|localhost(:\d+)?)$/;
export function origin(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  if (!HOSTS.test(host)) return null;
  return (host.startsWith("localhost") ? "http://" : "https://") + host;
}
// a same-site path to come back to after login; anything else goes home
export const safeReturn = (r) => (typeof r === "string" && /^\/(?!\/)[\w\-./?=&#%]*$/.test(r) ? r : "/");
