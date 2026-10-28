from datetime import timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from app.models.auth import SessionData
from app.routers.auth import LoginResponse, _check_rate_limit, _get_token_from_header
from app.routers.store import _handle_riot_error, get_session
from app.services import snapshot
from app.session_store import store

router = APIRouter()


class RedeemRequest(BaseModel):
    code: str


@router.post("")
async def take_snapshot(request: Request, session: SessionData = Depends(get_session)) -> dict:
    """Save everything the site shows right now and return a code that opens it elsewhere."""
    if session.snapshot_code:
        raise HTTPException(status_code=400, detail="This sign-in is itself a snapshot view.")
    try:
        snap = await snapshot.build(session)
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise _handle_riot_error(exc)
    code = snapshot.store(_get_token_from_header(request) or "", snap)
    return {
        "code": f"{code[:5]}-{code[5:]}",
        "taken_at": snap.taken_at,
        "expires_in": int(snapshot.SNAPSHOT_TTL),
        "parts": sorted(snap.data),
    }


@router.post("/redeem", response_model=LoginResponse)
async def redeem(body: RedeemRequest, request: Request) -> LoginResponse:
    _check_rate_limit(request.client.host if request.client else "unknown")
    code = snapshot.normalise(body.code)
    snap = snapshot.lookup(code)
    if snap is None:
        return LoginResponse(status="error", error="That code is invalid or has expired.")
    viewer = SessionData(
        access_token="",
        entitlements_token="",
        puuid=snap.puuid,
        shard=snap.shard,
        region=snap.region,
        snapshot_code=code,
    )
    token = store.create(viewer)
    viewer.expires_at = viewer.created_at + timedelta(hours=24)
    return LoginResponse(
        status="success",
        session_token=token,
        puuid=snap.puuid,
        promo=settings.is_promo_target(snap.puuid),
        snapshot_at=snap.taken_at,
    )
