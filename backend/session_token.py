"""Stateless signed conversation context (HS256, stdlib only).

Encodes the bounded conversation turns into a compact signed token that the
client replays on each /advise. Follow-ups ("why?", "what if 50k?") then survive
serverless cold starts and instance fan-out with NO server-side session store --
the token is the single source of truth (client-held state, stateless server).

Tamper-proof via HMAC-SHA256; NOT encrypted. It carries only the same safe
execution metadata the UI already sees (user text, decision one-liner, agent
summaries, verdict) -- never hidden reasoning. Set SESSION_SECRET in the
environment for production; a dev default is used otherwise.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os

_SECRET = (os.environ.get("SESSION_SECRET") or "finora-dev-secret-change-me").encode()
MAX_TOKEN_BYTES = 6000  # stay well under typical 8 KB header / cookie limits


def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(body: str) -> str:
    return _b64e(hmac.new(_SECRET, body.encode(), hashlib.sha256).digest())


def encode(turns: list[dict]) -> str:
    """Sign the conversation turns into a `body.sig` token. Oldest turns are
    dropped until the token fits MAX_TOKEN_BYTES (bounded, never unbounded)."""
    data = list(turns)
    while True:
        payload = json.dumps({"v": 1, "turns": data}, separators=(",", ":"), ensure_ascii=False)
        body = _b64e(payload.encode())
        token = f"{body}.{_sign(body)}"
        if len(token) <= MAX_TOKEN_BYTES or len(data) <= 1:
            return token
        data = data[1:]  # drop the oldest turn and retry


def decode(token: str | None) -> list[dict]:
    """Verify + decode a token into turns. Returns [] on any tamper/parse failure."""
    if not token or "." not in token:
        return []
    try:
        body, sig = token.split(".", 1)
        if not hmac.compare_digest(sig, _sign(body)):
            return []
        obj = json.loads(_b64d(body))
        turns = obj.get("turns")
        return turns if obj.get("v") == 1 and isinstance(turns, list) else []
    except Exception:
        return []


if __name__ == "__main__":  # ponytail: runnable self-check for the sign/verify path
    turns = [{"user": "afford iphone?", "decision_summary": "50% of savings", "findings": []}]
    tok = encode(turns)
    assert decode(tok) == turns, "round-trip failed"
    assert decode(tok[:-2] + ("aa" if tok[-2:] != "aa" else "bb")) == [], "tamper not rejected"
    assert decode("garbage") == [] and decode(None) == [], "bad input not handled"
    big = [{"user": f"q{i}", "decision_summary": "x" * 500, "findings": []} for i in range(50)]
    assert len(encode(big)) <= MAX_TOKEN_BYTES, "size bound not enforced"
    print("session_token self-check OK")
