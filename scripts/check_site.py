#!/usr/bin/env python3
"""Pre-deploy checks for site/: internal links resolve, published checksums
match the files, and nothing secret ships in the downloads or the repo.
Run from the repo root: python3 scripts/check_site.py"""
import hashlib, json, re, subprocess, sys, tarfile
from pathlib import Path

SITE = Path("site")
SECRET_NAME = re.compile(r"(^|/)(\.env[^/]*|[^/]*credentials[^/]*|[^/]*\.pem|id_[rd]sa[^/]*|\.xurl[^/]*|\.netrc)$", re.I)
SECRET_TEXT = re.compile(rb"(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}"
                         rb"|rpa_[A-Za-z0-9]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}"
                         rb"|-----BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.)")
errors = []

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def check_links():
    redirects = {r["source"] for r in json.loads((SITE / "vercel.json").read_text()).get("redirects", [])}
    for page in sorted(SITE.rglob("*.html")):
        if "node_modules" in page.parts:
            continue
        for ref in re.findall(r'(?:href|src)="([^"]+)"', page.read_text(errors="replace")):
            if re.match(r"^(https?:|mailto:|data:|#|javascript:)", ref) or "${" in ref:
                continue
            path = ref.split("#")[0].split("?")[0]
            if not path or path.startswith("/_vercel/") or path in redirects:
                continue
            target = (SITE / path.lstrip("/")) if path.startswith("/") else (page.parent / path)
            if target.is_dir():
                target = target / "index.html"
            if not target.exists():
                errors.append(f"{page}: broken link {ref}")

def check_downloads():
    dl = SITE / "downloads"
    sums = dl / "SHA256SUMS"
    if not sums.exists():
        return
    index = (dl / "index.html").read_text() if (dl / "index.html").exists() else ""
    for line in sums.read_text().split("\n"):
        if not line.strip():
            continue
        digest, name = line.split(maxsplit=1)
        f = dl / name.lstrip("*")
        if "/" in name:
            errors.append(f"SHA256SUMS: {name} has a directory path; `sha256sum -c` fails for downloaders")
        elif not f.exists():
            errors.append(f"SHA256SUMS: {name} missing")
        elif sha(f) != digest:
            errors.append(f"SHA256SUMS: {name} hash is stale")
        if index and digest not in index:
            errors.append(f"downloads/index.html: does not show the current sha256 for {name}")
    for tgz in dl.glob("*.tar.gz"):
        with tarfile.open(tgz) as t:
            for m in t.getmembers():
                if SECRET_NAME.search(m.name):
                    errors.append(f"{tgz.name}: ships secret-looking file {m.name}")
                elif m.isfile() and m.size < 2_000_000 and not m.name.endswith((".png", ".jpg", ".pt")):
                    if SECRET_TEXT.search(t.extractfile(m).read()):
                        errors.append(f"{tgz.name}: {m.name} contains a token-like string")

def check_repo():
    files = subprocess.run(["git", "ls-files"], capture_output=True, text=True).stdout.split("\n")
    for f in files:
        if f and SECRET_NAME.search(f) and not f.endswith(".example"):
            errors.append(f"repo: tracked secret-looking file {f}")

check_links(); check_downloads(); check_repo()
for e in errors:
    print("FAIL", e)
print(f"{len(errors)} problem(s)" if errors else "site checks passed")
sys.exit(1 if errors else 0)
