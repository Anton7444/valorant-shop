import asyncio
import logging
import time
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)

from app import version as version_info
from app.config import settings
from app.routers import account, auth, media, profile, store
from app.services import account_session, asset_cache

logger = logging.getLogger(__name__)

MAX_BODY_BYTES = 256 * 1024


class _TooLarge(Exception):
    pass


class BodyLimitMiddleware:
    """Answers 413 to request bodies over MAX_BODY_BYTES before they are buffered in memory.

    Every endpoint takes a tiny JSON body (a pasted URL, a token, some cookies), so anything bigger is
    abuse. A declared Content-Length is checked up front; chunked bodies are counted as they stream in.
    """

    def __init__(self, app, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def _reject(self, send) -> None:
        body = b'{"detail":"Request body too large"}'
        await send({
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
                (b"connection", b"close"),
            ],
        })
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        for key, value in scope["headers"]:
            if key == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    declared = self.max_bytes + 1
                if declared > self.max_bytes:
                    await self._reject(send)
                    return
        seen = 0
        started = False

        async def limited_receive():
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > self.max_bytes:
                    raise _TooLarge()
            return message

        async def tracking_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _TooLarge:
            if not started:
                await self._reject(send)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await asset_cache.initialize()
    keepalive = asyncio.create_task(account_session.keepalive_loop())
    try:
        yield
    finally:
        keepalive.cancel()


app = FastAPI(
    title="Valorant Shop Checker API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# added last = outermost: oversized bodies are refused before anything else touches them
app.add_middleware(BodyLimitMiddleware)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s -> %s (%.0fms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.get("/api/version")
async def version():
    """The commit this backend runs (read once at startup)."""
    return version_info.VERSION


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(account.router, prefix="/api", tags=["account"])
app.include_router(store.router, prefix="/api/store", tags=["store"])
app.include_router(profile.router, prefix="/api/profile", tags=["profile"])
app.include_router(media.router, prefix="/api/media", tags=["media"])
