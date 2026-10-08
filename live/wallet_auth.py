"""Proof that a visitor holds a Solana wallet, before the relay grants that wallet anything.

A wallet address is public: anyone can paste a whale's. So a wallet only counts after it signs a
one-time message the relay issued (Phantom signMessage, ed25519), and the relay then hands back a
short-lived session token that names the wallet. Everything wallet-gated reads the token, never a
raw address.

    GET  /auth/wallet/nonce?wallet=<pubkey>  -> {message}
    POST /auth/wallet/verify {wallet, message, signature}  (signature base58 or base64) -> {token, expires}
    then send the token as X-Chamber-Wallet-Token (or body "wallet_token")

Tokens are HMAC-signed with CHAMBER_SESSION_SECRET (set it on Railway; without it a random secret is
made at start, so tokens die with the process). Nonces live in memory for 5 minutes and are single-use.
"""
import base64
import hashlib
import hmac
import os
import re
import secrets
import time

WALLET_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
NONCE_TTL = 300
TOKEN_TTL = 7 * 86400
_SECRET = (os.environ.get("CHAMBER_SESSION_SECRET") or "").encode() or secrets.token_bytes(32)
_NONCES = {}   # nonce -> (wallet, expires)
_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58decode(s: str) -> bytes:
    n = 0
    for ch in s:
        i = _B58.find(ch)
        if i < 0:
            raise ValueError("not base58")
        n = n * 58 + i
    body = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    return b"\x00" * (len(s) - len(s.lstrip("1"))) + body


def valid_wallet(w) -> bool:
    if not isinstance(w, str) or not WALLET_RE.match(w):
        return False
    try:
        return len(b58decode(w)) == 32
    except ValueError:
        return False


def _gc(now):
    for k in [k for k, (_, exp) in _NONCES.items() if exp < now][:500]:
        _NONCES.pop(k, None)


def issue_message(wallet: str, now=None) -> str:
    """The exact text the wallet must sign."""
    now = now or time.time()
    _gc(now)
    if len(_NONCES) > 20000:
        raise RuntimeError("busy")
    nonce = secrets.token_hex(16)
    _NONCES[nonce] = (wallet, now + NONCE_TTL)
    return (f"wirehead: sign in as {wallet}\n"
            f"This proves you hold this wallet. It costs nothing and moves nothing.\n"
            f"nonce: {nonce}\nissued: {int(now)}")


def _sig_bytes(sig: str) -> bytes:
    sig = (sig or "").strip()
    for dec in (b58decode, lambda s: base64.b64decode(s, validate=True)):
        try:
            b = dec(sig)
            if len(b) == 64:
                return b
        except Exception:
            continue
    raise ValueError("signature must be 64 bytes, base58 or base64")


def verify(wallet: str, message: str, signature: str, now=None) -> bool:
    """True if `message` is a live nonce issued for `wallet` and `signature` is wallet's ed25519
    signature of it. The nonce is consumed either way."""
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    now = now or time.time()
    if not valid_wallet(wallet) or not isinstance(message, str):
        return False
    m = re.search(r"^nonce: ([0-9a-f]{32})$", message, re.M)
    if not m:
        return False
    owner, exp = _NONCES.pop(m.group(1), (None, 0))
    if owner != wallet or exp < now or not message.startswith(f"wirehead: sign in as {wallet}\n"):
        return False
    try:
        Ed25519PublicKey.from_public_bytes(b58decode(wallet)).verify(_sig_bytes(signature), message.encode())
        return True
    except (InvalidSignature, ValueError):
        return False


def make_token(wallet: str, now=None) -> tuple:
    exp = int((now or time.time()) + TOKEN_TTL)
    body = f"{wallet}.{exp}"
    mac = hmac.new(_SECRET, body.encode(), hashlib.sha256).hexdigest()[:40]
    return f"{body}.{mac}", exp


def read_token(token, now=None):
    """-> the wallet the token names, or None (missing, malformed, forged or expired)."""
    if not isinstance(token, str) or token.count(".") != 2:
        return None
    wallet, exp, mac = token.split(".")
    want = hmac.new(_SECRET, f"{wallet}.{exp}".encode(), hashlib.sha256).hexdigest()[:40]
    if not hmac.compare_digest(mac, want) or not exp.isdigit() or int(exp) < (now or time.time()):
        return None
    return wallet if valid_wallet(wallet) else None
