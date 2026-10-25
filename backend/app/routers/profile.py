import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.auth import SessionData
from app.models.battlepass import BattlePassResponse
from app.models.profile import MatchesResponse, ProfileResponse
from app.routers.store import _handle_riot_error, get_session
from app.services import battlepass, profile

router = APIRouter()


@router.get("", response_model=ProfileResponse)
async def get_profile(session: SessionData = Depends(get_session)) -> ProfileResponse:
    try:
        return await profile.get_profile(session)
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise _handle_riot_error(exc)


@router.get("/matches", response_model=MatchesResponse)
async def get_matches(start: int = Query(0, ge=0, le=1000), session: SessionData = Depends(get_session)) -> MatchesResponse:
    try:
        return await profile.get_matches(session, start)
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise _handle_riot_error(exc)


@router.get("/battlepass", response_model=BattlePassResponse)
async def get_battlepass(session: SessionData = Depends(get_session)) -> BattlePassResponse:
    try:
        result = await battlepass.get_battlepass(session)
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise _handle_riot_error(exc)
    if result is None:
        raise HTTPException(status_code=404, detail="No battle pass found for this account.")
    return result
