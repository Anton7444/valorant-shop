import httpx

from app.config import settings


def riot_client(**kwargs) -> httpx.AsyncClient:
    """An httpx client for calls to Riot, routed through RIOT_PROXY_URL when that is set."""
    kwargs.setdefault("timeout", 30.0)
    if settings.RIOT_PROXY_URL:
        kwargs["proxy"] = settings.RIOT_PROXY_URL
    return httpx.AsyncClient(**kwargs)
