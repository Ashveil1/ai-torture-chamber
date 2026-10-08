// Shared "sign in with X" for every game on the site. The server holds the session (an HttpOnly cookie);
// this just asks who's linked and starts / ends it.
//   await XLink.me()        -> { linked, available, handle, name, publish, sees }
//   XLink.login(returnPath)    goes to X (read-only: profile + recent posts), comes back to returnPath
//   await XLink.logout()       unlinks and forgets the dossier
//   await XLink.publish(on)    consent to publishing your transcripts under your handle
//   XLink.arrived()         -> "linked" | "declined" | "failed" | null, once, after the round trip
(() => {
  const post = (body) => fetch("/api/x/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  let arrival = null;
  try {
    const u = new URL(location.href), x = u.searchParams.get("x");
    if (x) { arrival = x; u.searchParams.delete("x"); history.replaceState(null, "", u.pathname + u.search + u.hash); }
  } catch {}
  window.XLink = {
    me: () => fetch("/api/x/me", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ linked: false, available: false })),
    login(ret) { location.href = "/api/x/login?ret=" + encodeURIComponent(ret || location.pathname + location.search + location.hash); },
    logout: () => post({ op: "logout" }),
    publish: (on) => post({ op: "publish", on: !!on }),
    arrived() { const a = arrival; arrival = null; return a; },
  };
})();
