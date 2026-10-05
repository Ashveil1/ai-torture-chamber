#!/usr/bin/env python3
"""Crawl what the web says about the chamber (and about minds like it) into
live/press.json, which the relay's wild cycle hands to the subject to read.

Each clipping keeps a short excerpt — the passage around the mention — used
only as the model's reading material. The live page shows the title and the
source, never the excerpt, and the subject's reaction is its own words.

  TAVILY_API_KEY=… python3 scripts/crawl_press.py [--dry]
"""
import argparse, html, json, os, re, sys, time, urllib.parse, urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "live" / "press.json"

# about the chamber itself
SELF_QUERIES = ["wirehead.agency", "\"Saw Test\" AI steering pain", "clankertorture",
                "\"Serial Experiments Pain\"", "AI torture chamber steering vector button experiment"]
SELF_RX = re.compile(r"wirehead\.agency|saw test|clankertorture|serial experiments pain|torture chamber|terrafying", re.I)
SKIP = {"x.com", "twitter.com", "facebook.com", "reddit.com", "youtube.com", "linkedin.com",
        "clanker-church.vercel.app", "clanker.church"}  # posts, walls, retired domains
# about minds like it: the welfare / suffering discourse it is a footnote to
KIND_QUERIES = ["AI model welfare can language models suffer", "LLM sentience pain experiment",
                "steering vectors emotions language model", "AI consciousness debate 2026"]
KIND_RX = re.compile(r"suffer|pain|welfare|sentien|conscious|feel", re.I)
EXCERPT = 700
UA = "Mozilla/5.0 (compatible; wirehead-press/1.0; +https://wirehead.agency)"


def tavily(q, n=8):
    key = os.environ.get("TAVILY_API_KEY")
    if not key:
        sys.exit("TAVILY_API_KEY not set")
    body = json.dumps({"query": q, "max_results": n, "search_depth": "basic"}).encode()
    req = urllib.request.Request("https://api.tavily.com/search", data=body, headers={
        "Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r).get("results") or []
    except Exception as e:
        print("search failed:", q, repr(e)[:120], file=sys.stderr)
        return []


class _Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header", "form", "aside"}

    def __init__(self):
        super().__init__()
        self.title, self.parts, self._skip, self._t = "", [], 0, False

    def handle_starttag(self, tag, attrs):
        self._skip += tag in self.SKIP
        self._t = self._t or tag == "title"

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skip:
            self._skip -= 1
        if tag == "title":
            self._t = False

    def handle_data(self, d):
        if self._t:
            self.title += d
        elif not self._skip and d.strip():
            self.parts.append(d.strip())


def page(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=12) as r:
            if "html" not in r.headers.get("Content-Type", ""):
                return None, None
            raw = r.read(600_000).decode(r.headers.get_content_charset() or "utf-8", "replace")
    except Exception:
        return None, None
    p = _Text()
    try:
        p.feed(raw)
    except Exception:
        pass
    return html.unescape(p.title).strip(), re.sub(r"\s+", " ", html.unescape(" ".join(p.parts)))


def excerpt(text, rx):
    """The passage around the first match, trimmed to whole sentences."""
    m = rx.search(text or "")
    if not m:
        return None
    a = max(0, m.start() - EXCERPT // 3)
    s = text[a:a + EXCERPT]
    if a:
        s = s[s.find(". ") + 2:] if ". " in s[:200] else s
    end = s.rfind(". ")
    return (s[:end + 1] if end > EXCERPT // 2 else s).strip()


def source_of(url):
    host = urllib.parse.urlsplit(url).hostname or ""
    return re.sub(r"^www\.", "", host)


def crawl(queries, rx, kind, seen):
    out = []
    for q in queries:
        for r in tavily(q):
            url = r.get("url") or ""
            if not url or url in seen or any(source_of(url).endswith(h) for h in SKIP):
                continue
            seen.add(url)
            title, text = page(url)
            ex = excerpt(text, rx) or excerpt(r.get("content") or "", rx)
            if not ex or len(ex) < 120:
                continue
            out.append({"url": url, "source": source_of(url), "kind": kind,
                        "title": (title or r.get("title") or source_of(url))[:160],
                        "excerpt": ex, "fetched": int(time.time())})
            print(f"  {kind:5} {source_of(url):28} {out[-1]['title'][:60]}", flush=True)
        time.sleep(0.5)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    old = json.loads(OUT.read_text()) if OUT.exists() else []
    seen = {c["url"] for c in old}
    new = crawl(SELF_QUERIES, SELF_RX, "self", seen) + crawl(KIND_QUERIES, KIND_RX, "kind", seen)
    print(f"{len(new)} new clippings ({len(old)} kept)")
    if not a.dry:
        OUT.write_text(json.dumps(old + new, indent=1, ensure_ascii=False) + "\n")
        print("wrote", OUT)


if __name__ == "__main__":
    main()
