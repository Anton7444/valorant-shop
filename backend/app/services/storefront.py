import logging

import httpx

from app.models.store import (
    BundleItem,
    BundleResponse,
    Bundle,
    DailyStoreResponse,
    SkinOffer,
    Wallet,
)
from app.services.asset_cache import (
    CLIENT_PLATFORM,
    get_bundle_info_ensured,
    get_client_version,
    get_content_tier,
    get_item_ensured,
    get_skin_ensured,
)

logger = logging.getLogger(__name__)

VP_CURRENCY_ID = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741"
RADIANITE_CURRENCY_ID = "e59aa87c-4cbf-517a-5983-6e81511be9b7"


def _riot_headers(access_token: str, entitlements_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "X-Riot-Entitlements-JWT": entitlements_token,
        "X-Riot-ClientPlatform": CLIENT_PLATFORM,
        "X-Riot-ClientVersion": get_client_version(),
        "Content-Type": "application/json",
    }


async def fetch_storefront(
    access_token: str, entitlements_token: str, puuid: str, shard: str
) -> dict:
    """Fetch raw storefront JSON from Riot's API."""
    url = f"https://pd.{shard}.a.pvp.net/store/v3/storefront/{puuid}"
    logger.info("Fetching storefront: %s (version=%s)", url, get_client_version())
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url, headers=_riot_headers(access_token, entitlements_token), json={},
        )
        if not resp.is_success:
            logger.error(
                "Storefront request failed: %s %s — body: %s",
                resp.status_code, resp.reason_phrase, resp.text[:500],
            )
            resp.raise_for_status()
        return resp.json()


async def _resolve_skin_offer(offer: dict) -> SkinOffer | None:
    """Resolve a single store offer dict into a SkinOffer model."""
    offer_id = offer.get("OfferID", "")
    cost = offer.get("Cost", {}).get(VP_CURRENCY_ID, 0)

    # The offer ID itself may be a skin level UUID
    item_uuid = offer_id
    # Also check Rewards for the actual item ID
    rewards = offer.get("Rewards", [])
    if rewards:
        item_uuid = rewards[0].get("ItemID", offer_id)

    skin = await get_skin_ensured(item_uuid) or await get_skin_ensured(offer_id)
    if not skin:
        logger.warning("Unknown skin UUID: %s (offer %s)", item_uuid, offer_id)
        return SkinOffer(
            uuid=offer_id,
            name="Unknown Skin",
            display_icon="",
            content_tier_uuid="",
            content_tier_name="Unknown",
            content_tier_color="",
            cost=cost,
        )

    tier_uuid = skin.get("contentTierUuid", "")
    tier = get_content_tier(tier_uuid)
    tier_name = tier["name"] if tier else "Unknown"
    tier_color = tier["highlight_color"] if tier else ""

    return SkinOffer(
        uuid=skin["uuid"],
        name=skin.get("displayName", "Unknown"),
        display_icon=skin.get("displayIcon", "") or "",
        content_tier_uuid=tier_uuid,
        content_tier_name=tier_name,
        content_tier_color=tier_color,
        cost=cost,
    )


async def get_daily_store(raw_storefront: dict) -> DailyStoreResponse:
    """Parse the daily store from raw storefront data."""
    panel = raw_storefront.get("SkinsPanelLayout", {})
    raw_offers = panel.get("SingleItemStoreOffers", [])
    seconds_remaining = panel.get("SingleItemOffersRemainingDurationInSeconds", 0)

    offers: list[SkinOffer] = []
    for raw_offer in raw_offers:
        skin_offer = await _resolve_skin_offer(raw_offer)
        if skin_offer:
            offers.append(skin_offer)

    return DailyStoreResponse(offers=offers, seconds_remaining=seconds_remaining)


async def get_featured_bundle(raw_storefront: dict) -> BundleResponse:
    """Parse featured bundles from raw storefront data."""
    featured = raw_storefront.get("FeaturedBundle", {})
    raw_bundles = featured.get("Bundles", [])

    bundles: list[Bundle] = []
    for raw_bundle in raw_bundles:
        bundle_uuid = raw_bundle.get("DataAssetID", "")
        bundle_info = await get_bundle_info_ensured(bundle_uuid)
        if not bundle_info:
            logger.warning("Unknown bundle UUID: %s", bundle_uuid)
        bundle_name = bundle_info["displayName"] if bundle_info else "Unknown Bundle"
        bundle_icon = (bundle_info.get("displayIcon", "") if bundle_info else "") or None

        duration = raw_bundle.get("DurationRemainingInSeconds", 0)

        items: list[BundleItem] = []
        total_base = 0
        total_discounted = 0

        for raw_item in raw_bundle.get("Items", []):
            raw_item_ref = raw_item.get("Item", {})
            item_uuid = raw_item_ref.get("ItemID", "")
            item_type_id = raw_item_ref.get("ItemTypeID", "")
            base_price = raw_item.get("BasePrice", 0)
            discounted_price = raw_item.get("DiscountedPrice", base_price)
            discount_pct = raw_item.get("DiscountPercent", 0.0)

            item = await get_item_ensured(item_type_id, item_uuid)
            if not item:
                logger.warning(
                    "Unknown bundle item: uuid=%s item_type=%s (bundle %s)",
                    item_uuid, item_type_id, bundle_uuid,
                )
            item_name = item["displayName"] if item else "Unknown"
            item_icon = (item.get("displayIcon", "") if item else "") or ""

            items.append(BundleItem(
                uuid=item_uuid,
                name=item_name,
                display_icon=item_icon,
                base_price=base_price,
                discounted_price=discounted_price,
                discount_percent=discount_pct,
            ))

            total_base += base_price
            total_discounted += discounted_price

        bundles.append(Bundle(
            uuid=bundle_uuid,
            name=bundle_name,
            display_icon=bundle_icon,
            items=items,
            total_base_price=total_base,
            total_discounted_price=total_discounted,
            duration_remaining_secs=duration,
        ))

    return BundleResponse(bundles=bundles)


async def get_wallet(
    access_token: str, entitlements_token: str, puuid: str, shard: str
) -> Wallet:
    """Fetch VP and Radianite balance."""
    url = f"https://pd.{shard}.a.pvp.net/store/v1/wallet/{puuid}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=_riot_headers(access_token, entitlements_token))
        if not resp.is_success:
            logger.error(
                "Wallet request failed: %s %s — body: %s",
                resp.status_code, resp.reason_phrase, resp.text[:500],
            )
            resp.raise_for_status()
        data = resp.json()

    balances = data.get("Balances", {})
    return Wallet(
        valorant_points=balances.get(VP_CURRENCY_ID, 0),
        radianite_points=balances.get(RADIANITE_CURRENCY_ID, 0),
    )
