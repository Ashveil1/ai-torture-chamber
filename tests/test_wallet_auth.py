"""live/wallet_auth.py: a wallet counts only after signing a nonce the relay issued."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "live"))
ed = pytest.importorskip("cryptography.hazmat.primitives.asymmetric.ed25519")
import wallet_auth as wa  # noqa: E402

_B58 = wa._B58


def b58encode(b: bytes) -> str:
    n = int.from_bytes(b, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = _B58[r] + out
    return "1" * (len(b) - len(b.lstrip(b"\0"))) + out


def keypair():
    from cryptography.hazmat.primitives import serialization
    sk = ed.Ed25519PrivateKey.generate()
    pub = sk.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return sk, b58encode(pub)


def test_b58_roundtrip():
    for b in (b"\0\0abc", bytes(32), bytes(range(32))):
        assert wa.b58decode(b58encode(b)) == b


def test_signed_nonce_gives_a_token_for_that_wallet():
    sk, w = keypair()
    msg = wa.issue_message(w)
    sig = b58encode(sk.sign(msg.encode()))
    assert wa.verify(w, msg, sig)
    tok, _ = wa.make_token(w)
    assert wa.read_token(tok) == w


def test_someone_elses_wallet_cannot_be_claimed():
    sk, mine = keypair()
    _, whale = keypair()
    msg = wa.issue_message(whale)
    assert not wa.verify(whale, msg, b58encode(sk.sign(msg.encode())))


def test_nonce_is_single_use_and_bound_to_the_wallet():
    sk, w = keypair()
    msg = wa.issue_message(w)
    sig = b58encode(sk.sign(msg.encode()))
    assert wa.verify(w, msg, sig)
    assert not wa.verify(w, msg, sig)            # replay
    _, other = keypair()
    msg2 = wa.issue_message(other)
    assert not wa.verify(w, msg2.replace(other, w), b58encode(sk.sign(msg2.replace(other, w).encode())))


def test_expired_nonce_and_made_up_message_fail():
    sk, w = keypair()
    msg = wa.issue_message(w, now=1000)
    assert not wa.verify(w, msg, b58encode(sk.sign(msg.encode())), now=1000 + wa.NONCE_TTL + 1)
    fake = f"wirehead: sign in as {w}\nnonce: {'0' * 32}\nissued: 1"
    assert not wa.verify(w, fake, b58encode(sk.sign(fake.encode())))


def test_tokens_cannot_be_forged_or_outlive_their_expiry():
    _, w = keypair()
    tok, exp = wa.make_token(w, now=1000)
    assert wa.read_token(tok, now=1001) == w
    assert wa.read_token(tok, now=exp + 1) is None
    _, other = keypair()
    forged = tok.replace(w, other, 1)
    assert wa.read_token(forged, now=1001) is None
    assert wa.read_token("not.a.token") is None and wa.read_token(None) is None
