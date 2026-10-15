import httpx
from fastapi import APIRouter, Depends

from app.models.auth import SessionData
from app.models.profile import ProfileResponse
from app.routers.store import _handle_riot_error, get_session
from app.services import profile

router = APIRouter()


@router.get("", response_model=ProfileResponse)
async def get_profile(session: SessionData = Depends(get_session)) -> ProfileResponse:
    try:
        return await profile.get_profile(session)
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise _handle_riot_error(exc)
