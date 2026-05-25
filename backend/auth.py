"""JWT issuance + verification for driver authentication.

v3.31: drivers log in with their 8-digit employee ID and receive a JWT that
authorizes subsequent calls to driver-facing endpoints.  The admin path
(X-Admin-Password header → admin write endpoints) is unchanged and runs
in parallel — admin doesn't need a JWT.

Signed with `JWT_SECRET` env var (HS256).  7-day expiry.  Issued tokens are
stateless: no server-side session store, so logout is a client-side delete.
"""
from __future__ import annotations
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

try:
    import jwt as _jwt   # PyJWT
except ImportError:                          # pragma: no cover
    _jwt = None  # type: ignore

JWT_ALG = "HS256"
JWT_EXPIRY_DAYS = 7


def _secret() -> str:
    """Return the signing secret.  Missing-or-empty raises so misconfig is loud."""
    s = (os.environ.get("JWT_SECRET") or "").strip()
    if not s:
        raise RuntimeError(
            "JWT_SECRET env var is not set.  Generate one with `openssl rand -hex 32` "
            "and add it to the backend's environment."
        )
    if len(s) < 32:
        raise RuntimeError(
            "JWT_SECRET is too short (<32 chars).  Generate a strong value with "
            "`openssl rand -hex 32`."
        )
    return s


def issue_jwt(employee_id: str, role: str = "driver") -> str:
    """Mint a JWT for the given employee.  Default role is 'driver'."""
    if _jwt is None:
        raise RuntimeError("PyJWT is not installed.  Add `PyJWT>=2.9.0` to requirements.txt.")
    now = datetime.now(timezone.utc)
    payload = {
        "sub": employee_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=JWT_EXPIRY_DAYS)).timestamp()),
    }
    token = _jwt.encode(payload, _secret(), algorithm=JWT_ALG)
    # PyJWT 2.x returns str; older versions returned bytes
    return token if isinstance(token, str) else token.decode("utf-8")


class InvalidTokenError(Exception):
    """Raised for malformed, expired, or wrong-signature tokens."""


def verify_jwt(token: str) -> dict:
    """Decode + validate a JWT.  Returns the claims dict on success;
    raises InvalidTokenError on any failure."""
    if _jwt is None:
        raise InvalidTokenError("PyJWT is not installed.")
    if not token:
        raise InvalidTokenError("Empty token.")
    try:
        return _jwt.decode(token, _secret(), algorithms=[JWT_ALG])
    except _jwt.ExpiredSignatureError:
        raise InvalidTokenError("Token has expired.")
    except _jwt.InvalidTokenError as e:
        raise InvalidTokenError(str(e))


def extract_bearer(authorization_header: Optional[str]) -> Optional[str]:
    """Extract the raw token from an `Authorization: Bearer <token>` header.
    Returns None if the header is missing or malformed."""
    if not authorization_header:
        return None
    parts = authorization_header.strip().split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None
