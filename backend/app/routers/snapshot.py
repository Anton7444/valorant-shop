import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from app.models.auth import SessionData
from app.routers.auth import LoginResponse, _check_rate_limit, _get_token_from_header
from app.routers.store import _handle_riot_error, get_session
from app.services import snapshot

router = APIRouter()


class RedeemRequest(BaseModel):
    code: str


class TakeRequest(BaseModel):
    # An earlier code of this account to refresh in place (the auto-update does this).
    code: str | None = None


@router.post("")
async def take_snapshot(
    request: Request, body: TakeRequest | None = None, session: SessionData = Depends(get_session)
) -> dict:
    """Save everything the site shows right now and return a code that opens it elsewhere."""
    if session.snapshot_code:
        raise HTTPException(status_code=400, detail="This sign-in is itself a snapshot view.")
    try:
        snap = await snapshot.build(session)
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise _handle_riot_error(exc)
    code = snapshot.store(_get_token_from_header(request) or "", snap, body.code if body else None)
    return {
        "code": f"{code[:5]}-{code[5:]}",
        "taken_at": snap.taken_at,
        "expires_in": int(snapshot.SNAPSHOT_TTL),  # 0 = never
        "parts": sorted(snap.data),
    }


@router.post("/revoke")
async def revoke(body: RedeemRequest, session: SessionData = Depends(get_session)) -> dict:
    """Stop sharing: delete the snapshot behind a code (only its own account may)."""
    return {"revoked": snapshot.revoke(body.code, session.puuid)}


@router.post("/redeem", response_model=LoginResponse)
async def redeem(body: RedeemRequest, request: Request) -> LoginResponse:
    _check_rate_limit(request.client.host if request.client else "unknown")
    code = snapshot.normalise(body.code)
    snap = snapshot.lookup(code)
    if snap is None:
        return LoginResponse(status="error", error="That code is invalid or has expired.")
    # Viewer sessions are stateless (the token is derived from the code), so they survive restarts.
    return LoginResponse(
        status="success",
        session_token=snapshot.TOKEN_PREFIX + code,
        puuid=snap.puuid,
        promo=settings.is_promo_target(snap.puuid),
        snapshot_at=snap.taken_at,
    )
