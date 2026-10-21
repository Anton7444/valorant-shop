from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

router = APIRouter()

ALLOWED_HOSTS = {"media.valorant-api.com", "valorant.dyn.riotcdn.net"}
FORWARD_REQUEST_HEADERS = ("range", "if-range")
FORWARD_RESPONSE_HEADERS = ("content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified")


@router.get("/video")
async def proxy_video(u: str, request: Request):
    """Stream a skin demo video through this server (supports Range, so seeking works)."""
    parsed = urlparse(u)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise HTTPException(status_code=400, detail="Unsupported media URL")

    headers = {k: v for k, v in request.headers.items() if k.lower() in FORWARD_REQUEST_HEADERS}
    client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=60.0))
    try:
        upstream = await client.send(client.build_request("GET", u, headers=headers), stream=True)
    except httpx.HTTPError:
        await client.aclose()
        raise HTTPException(status_code=502, detail="Could not fetch the video")

    if upstream.status_code >= 400:
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(status_code=502, detail="Video not available")

    async def body():
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    response_headers = {k: v for k, v in upstream.headers.items() if k.lower() in FORWARD_RESPONSE_HEADERS}
    response_headers["Cache-Control"] = "public, max-age=86400"
    return StreamingResponse(body(), status_code=upstream.status_code, headers=response_headers)
