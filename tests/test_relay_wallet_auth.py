"""The relay's wallet-gated endpoints only trust a signed-in session, never a pasted address."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "live"))
server = pytest.importorskip("server")
ed = pytest.importorskip("cryptography.hazmat.primitives.asymmetric.ed25519")
from fastapi.testclient import TestClient  # noqa: E402
from test_wallet_auth import b58encode, keypair  # noqa: E402

client = TestClient(server.app)   # no `with`: startup (model load) never runs


def sign_in(sk, w):
    msg = client.get("/auth/wallet/nonce", params={"wallet": w}).json()["message"]
    r = client.post("/auth/wallet/verify", json={"wallet": w, "message": msg, "signature": b58encode(sk.sign(msg.encode()))})
    return r


def test_nonce_rejects_garbage_addresses():
    assert client.get("/auth/wallet/nonce", params={"wallet": "not-a-wallet"}).status_code == 400


def test_signing_in_gives_a_token_the_relay_reads_back():
    sk, w = keypair()
    r = sign_in(sk, w)
    assert r.status_code == 200
    tok = r.json()["token"]

    class Req:
        headers = {"x-chamber-wallet-token": tok}
    assert server._session_wallet(Req, {}) == w


def test_a_pasted_whale_address_gets_nothing():
    _, whale = keypair()

    class Req:
        headers = {}
    assert server._session_wallet(Req, {"wallet": whale}) is None   # the old body field is ignored


def test_someone_elses_signature_is_refused():
    sk, _ = keypair()
    _, whale = keypair()
    msg = client.get("/auth/wallet/nonce", params={"wallet": whale}).json()["message"]
    r = client.post("/auth/wallet/verify", json={"wallet": whale, "message": msg, "signature": b58encode(sk.sign(msg.encode()))})
    assert r.status_code == 401


def test_board_rows_need_the_wallets_own_session():
    _, w = keypair()
    assert client.get("/sawboard/me", params={"wallet": w}).status_code == 401
    assert client.post("/sawboard/join", json={"wallet": w, "alias": "someone", "x_handle": "realperson", "show_x": True}).status_code == 401
