import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from app.models.auth import SessionData
from app.routers.auth import LoginResponse, _check_rate_limit, _get_token_from_header
from app.routers.store import _handle_riot_error, get_session
from app.services import snapshot

router = APIRouter()


def _only_owner(session: SessionData) -> None:
    if settings.OWNER_PUUID and not session.puuid.lower().startswith(settings.OWNER_PUUID.lower()):
        raise HTTPException(status_code=403, detail="Snapshots are not enabled for this account.")


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
    _only_owner(session)
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


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


@router.get("/account")
async def my_account(session: SessionData = Depends(get_session)) -> dict:
    return {"username": None if session.snapshot_code else snapshot.account_of(session.puuid)}


@router.post("/account")
async def create_account(body: RegisterRequest, session: SessionData = Depends(get_session)) -> dict:
    """Create the username and password that open this Riot account's data from another computer.

    Only a computer that is signed in to Riot can do this, so an account can only be bound to a Riot
    account you really control.
    """
    if session.snapshot_code:
        raise HTTPException(status_code=400, detail="Create it from the computer that is signed in to Riot.")
    _only_owner(session)
    if not 8 <= len(body.password) <= 200:
        raise HTTPException(status_code=400, detail="Use a password of 8 to 200 characters.")
    if not any(sn.puuid == session.puuid for sn in snapshot._snapshots.values()):
        raise HTTPException(status_code=409, detail="Save a snapshot first, then create the account.")
    try:
        snapshot.register(session.puuid, body.username.strip(), body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return {"username": body.username.strip()}


@router.post("/account/delete")
async def remove_account(session: SessionData = Depends(get_session)) -> dict:
    if session.snapshot_code:
        raise HTTPException(status_code=400, detail="Do this from the computer that is signed in to Riot.")
    snapshot.delete_account(session.puuid)
    return {"deleted": True}


@router.post("/login", response_model=LoginResponse)
async def account_login(body: LoginRequest, request: Request) -> LoginResponse:
    """Sign in with a username and password to see that account's saved data."""
    _check_rate_limit(request.client.host if request.client else "unknown")
    wrong = LoginResponse(status="error", error="Wrong username or password, or nothing is being shared right now.")
    if snapshot.login_locked(body.username[:64]):
        return LoginResponse(status="error", error="Too many wrong attempts. Wait about 15 minutes.")
    code = snapshot.code_for_login(body.username[:64], body.password[:200])
    snap = snapshot.lookup(code) if code else None
    if not code or snap is None:
        return wrong
    return LoginResponse(
        status="success",
        session_token=snapshot.TOKEN_PREFIX + code,
        puuid=snap.puuid,
        promo=settings.is_promo_target(snap.puuid),
        snapshot_at=snap.taken_at,
        snapshot_live=snapshot.is_live(snap),
    )


@router.post("/refresh")
async def refresh(session: SessionData = Depends(get_session)) -> dict:
    """A snapshot viewer asks for fresh data."""
    if not session.snapshot_code:
        raise HTTPException(status_code=400, detail="Only a snapshot view can ask for a refresh.")
    return snapshot.request_refresh(session.snapshot_code)


@router.get("/pending")
async def pending(session: SessionData = Depends(get_session)) -> dict:
    """The signed-in home computer asks whether a viewer wants fresh data."""
    if session.snapshot_code:
        return {"requested": False}
    return {"requested": snapshot.take_pending(session.puuid)}


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
        snapshot_live=snapshot.is_live(snap),
    )
