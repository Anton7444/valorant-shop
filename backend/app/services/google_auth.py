"""Verifies a Google sign-in. The page's own "Continue with Google" button opens Google's popup and gets an
access token for this app's OAuth client; the server checks the token really belongs to this client and reads
the account's identity from Google."""

import httpx

from app.config import settings

TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


class GoogleAuthError(Exception):
    pass


async def verify(access_token: str) -> dict:
    """Returns the verified identity (sub, email, name). Raises GoogleAuthError; httpx errors mean Google is unreachable."""
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleAuthError("Google sign-in is not set up on this server.")
    async with httpx.AsyncClient(timeout=15.0) as client:
        info = await client.get(TOKENINFO_URL, params={"access_token": access_token})
        if info.status_code != 200:
            raise GoogleAuthError("The Google sign-in could not be verified.")
        data = info.json()
        # A token issued to some other app must never log in here.
        if data.get("aud") != settings.GOOGLE_CLIENT_ID:
            raise GoogleAuthError("The Google sign-in could not be verified.")
        user = await client.get(USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
        if user.status_code != 200:
            raise GoogleAuthError("The Google sign-in could not be verified.")
        claims = user.json()
    if not claims.get("sub") or not claims.get("email") or not claims.get("email_verified"):
        raise GoogleAuthError("The Google account has no verified email.")
    allowed = [e.strip().lower() for e in settings.ALLOWED_EMAILS.split(",") if e.strip()]
    if allowed and claims["email"].lower() not in allowed:
        raise GoogleAuthError("This Google account is not allowed on this server.")
    return claims
