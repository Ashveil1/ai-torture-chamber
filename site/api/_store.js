// Storage for the third-key bounty: Upstash Redis when configured (Vercel Marketplace sets
// KV_REST_API_* or UPSTASH_REDIS_REST_*), an in-memory stand-in for local runs only.
import { Redis } from "@upstash/redis";

function memory() {
  const kv = new Map(), exp = new Map();
  const live = (k) => { if (exp.has(k) && exp.get(k) < Date.now()) { kv.delete(k); exp.delete(k); } return kv.has(k); };
  return {
    async get(k) { return live(k) ? structuredClone(kv.get(k)) : null; },
    async set(k, v, o = {}) {
      if (o.nx && live(k)) return null;
      kv.set(k, structuredClone(v)); if (o.ex) exp.set(k, Date.now() + o.ex * 1000); else exp.delete(k);
      return "OK";
    },
    async incr(k) { const v = (live(k) ? kv.get(k) : 0) + 1; kv.set(k, v); return v; },
    async expire(k, s) { if (live(k)) exp.set(k, Date.now() + s * 1000); return 1; },
    async rpush(k, v) { const a = live(k) ? kv.get(k) : []; a.push(structuredClone(v)); kv.set(k, a); return a.length; },
    async lrange(k, a, b) { const l = live(k) ? kv.get(k) : []; return structuredClone(l.slice(a, b === -1 ? undefined : b + 1)); },
    async ltrim(k, a, b) { if (live(k)) { const l = kv.get(k); const n = l.length; const s = a < 0 ? n + a : a, e = b < 0 ? n + b : b; kv.set(k, l.slice(Math.max(0, s), e + 1)); } return "OK"; },
  };
}

let store;
export function getStore() {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) store = new Redis({ url, token });
  else if (!process.env.VERCEL) store = memory();
  else return null; // deployed without a database: refuse rather than lose a win
  return store;
}
