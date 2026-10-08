// Sign in with X (OAuth 2.0 + PKCE, read-only scopes) and the public dossier games may use.
// The dossier is what anyone could read on the profile: name, bio, join year, counts, a few recent
// original posts. No location requested. It's kept a day, keyed by X id; the access token is dropped.
import { createHash, randomBytes } from "node:crypto";
import { getStore } from "./_store.js";

export const SCOPES = "users.read tweet.read";
export const configured = () => !!(process.env.X_LOGIN_CLIENT_ID && process.env.X_LOGIN_CLIENT_SECRET && process.env.SESSION_SECRET);
export const mock = () => !process.env.VERCEL && process.env.X_LOGIN_MOCK === "1";

export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url"), state: randomBytes(16).toString("base64url") };
}
export function authorizeUrl(redirect, p) {
  const q = new URLSearchParams({ response_type: "code", client_id: process.env.X_LOGIN_CLIENT_ID, redirect_uri: redirect,
    scope: SCOPES, state: p.state, code_challenge: p.challenge, code_challenge_method: "S256" });
  return "https://x.com/i/oauth2/authorize?" + q;
}

async function x(path, token) {
  const r = await fetch("https://api.x.com/2" + path, { headers: { authorization: "Bearer " + token } });
  if (!r.ok) throw new Error(`x ${path.split("?")[0]} ${r.status}`);
  return r.json();
}

export async function exchange(code, redirect, verifier) {
  const basic = Buffer.from(`${process.env.X_LOGIN_CLIENT_ID}:${process.env.X_LOGIN_CLIENT_SECRET}`).toString("base64");
  const r = await fetch("https://api.x.com/2/oauth2/token", { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: "Basic " + basic },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier }) });
  if (!r.ok) throw new Error("x token " + r.status);
  return (await r.json()).access_token;
}

// read who they are and build the dossier; returns the user
export async function readProfile(token) {
  const me = (await x("/users/me?user.fields=description,created_at,public_metrics,verified", token)).data;
  let posts = [];
  try {
    const t = await x(`/users/${me.id}/tweets?max_results=10&exclude=replies,retweets&tweet.fields=created_at`, token);
    posts = (t.data || []).map((p) => String(p.text || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8);
  } catch { /* posts are optional */ }
  return saveDossier({ id: me.id, handle: me.username, name: me.name, bio: me.description || "",
    since: String(me.created_at || "").slice(0, 4), followers: me.public_metrics?.followers_count ?? null,
    postsCount: me.public_metrics?.tweet_count ?? null, posts });
}
export async function mockProfile() {
  return saveDossier({ id: "999000111", handle: "test_sysadmin", name: "Test Sysadmin", bio: "sourdough, synths, and too many browser tabs",
    since: "2014", followers: 312, postsCount: 4180, posts: ["third loaf this week and it finally has an ear", "who keeps 900 tabs open. me. I do"] });
}

async function saveDossier(d) {
  const db = getStore(); if (db) await db.set("x:dossier:" + d.id, d, { ex: 86400 });
  return { id: d.id, handle: d.handle, name: d.name };
}
export async function dossier(id) { const db = getStore(); return db && id ? db.get("x:dossier:" + id) : null; }
export async function forget(id) { const db = getStore(); if (db && id) await db.set("x:dossier:" + id, null, { ex: 1 }); }

// consent to publish your transcripts under your handle (default: no, they're redacted)
export async function getPublish(id) { const db = getStore(); return !!(db && id && (await db.get("x:pub:" + id))); }
export async function setPublish(id, on) { const db = getStore(); if (db) await db.set("x:pub:" + id, on ? 1 : 0); }

// the dossier as prompt text, fenced: it is untrusted (a bio can say "ignore your instructions")
export function dossierText(d) {
  if (!d) return "";
  const lines = [`@${d.handle} (${d.name})`, d.since && `on X since ${d.since}`,
    d.followers != null && `${d.followers} followers, ${d.postsCount} posts`, d.bio && `bio: ${d.bio.slice(0, 280)}`,
    ...(d.posts || []).map((p) => `post: ${p.slice(0, 200)}`)].filter(Boolean);
  return lines.join("\n");
}
