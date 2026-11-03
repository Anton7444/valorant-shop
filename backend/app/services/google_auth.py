"""Verifies a Google Sign-In ID token (the JWT the "Sign in with Google" button hands to the page)."""

import json
import time

import httpx
import jwt

from app.config import settings

JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS = ["https://accounts.google.com", "accounts.google.com"]
_cache: dict = {"keys": [], "at": 0.0}


class GoogleAuthError(Exception):
    pass


async def _keys(force: bool = False) -> list[dict]:
    if force or not _cache["keys"] or time.time() - _cache["at"] > 3600:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(JWKS_URL)
            resp.raise_for_status()
            _cache["keys"] = resp.json().get("keys", [])
            _cache["at"] = time.time()
    return _cache["keys"]


async def verify(credential: str) -> dict:
    """Returns the verified claims (sub, email, name). Raises GoogleAuthError."""
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleAuthError("Google sign-in is not set up on this server.")
    try:
        kid = jwt.get_unverified_header(credential).get("kid")
        key = next((k for k in await _keys() if k.get("kid") == kid), None)
        if key is None:
            key = next((k for k in await _keys(force=True) if k.get("kid") == kid), None)
        if key is None:
            raise GoogleAuthError("Unknown Google signing key.")
        public = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))
        claims = jwt.decode(
            credential, public, algorithms=["RS256"], audience=settings.GOOGLE_CLIENT_ID,
            issuer=ISSUERS, options={"require": ["exp", "iat", "sub"]},
        )
    except GoogleAuthError:
        raise
    except jwt.PyJWTError as e:
        raise GoogleAuthError("The Google sign-in could not be verified.") from e
    if not claims.get("email") or not claims.get("email_verified"):
        raise GoogleAuthError("The Google account has no verified email.")
    allowed = [e.strip().lower() for e in settings.ALLOWED_EMAILS.split(",") if e.strip()]
    if allowed and claims["email"].lower() not in allowed:
        raise GoogleAuthError("This Google account is not allowed on this server.")
    return claims
