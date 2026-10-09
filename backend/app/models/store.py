from pydantic import BaseModel


class SkinLevel(BaseModel):
    uuid: str
    level_number: int
    display_icon: str
    video_url: str | None = None


class SkinOffer(BaseModel):
    uuid: str
    name: str
    display_icon: str
    content_tier_uuid: str
    content_tier_name: str
    content_tier_color: str
    cost: int
    levels: list[SkinLevel] = []
    owned: bool = False


class OwnedSkin(BaseModel):
    uuid: str
    name: str
    display_icon: str
    content_tier_uuid: str
    content_tier_name: str
    content_tier_color: str
    levels: list[SkinLevel] = []
    weapon: str = ""


class CatalogSkin(OwnedSkin):
    pass


class CatalogResponse(BaseModel):
    skins: list[CatalogSkin]
    weapons: list[str]


class InventoryResponse(BaseModel):
    skins: list[OwnedSkin]
    weapons: list[str] = []


class BundleItem(BaseModel):
    uuid: str
    name: str
    display_icon: str
    base_price: int
    discounted_price: int
    discount_percent: float
    levels: list[SkinLevel] = []


class Bundle(BaseModel):
    uuid: str
    name: str
    display_icon: str | None = None
    items: list[BundleItem]
    total_base_price: int
    total_discounted_price: int
    duration_remaining_secs: int


class Wallet(BaseModel):
    valorant_points: int
    radianite_points: int


class DailyStoreResponse(BaseModel):
    offers: list[SkinOffer]
    seconds_remaining: int


class BundleResponse(BaseModel):
    bundles: list[Bundle]
