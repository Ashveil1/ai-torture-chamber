// Stamps relay-bound requests (/chamber/* -> Railway, see vercel.json) with the
// shared RELAY_PROXY_KEY and the client IP Vercel saw, so the relay can tell real
// visitors' addresses from forged X-Forwarded-For headers sent straight to Railway.
import { ipAddress, next } from "@vercel/functions";

export const config = { matcher: "/chamber/:path*" };

export default function middleware(request) {
  const key = process.env.RELAY_PROXY_KEY;
  if (!key) return next({ headers: { "x-wh-mw": "nokey" } });
  const headers = new Headers(request.headers);
  headers.set("x-wh-relay-key", key);
  headers.set("x-wh-client-ip", ipAddress(request) || "");
  return next({ request: { headers }, headers: { "x-wh-mw": "1" } });
}
