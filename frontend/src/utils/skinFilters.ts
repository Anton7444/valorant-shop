import type { OwnedSkin } from '../types';
import { localizedName } from '../context/languageNames';

export type SkinTier = { id: string; name: string; color: string };

export function toggle(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

// Skin names end with the weapon name ("Glitchpop Ares"); drop it so a search
// only matches the skin's own name, not every skin of that weapon.
function searchableName(skin: OwnedSkin, names: Record<string, string>): string {
  let name = localizedName(skin.uuid, skin.name, names);
  const weapon = skin.weapon ?? '';
  const weapons = [localizedName(weapon, weapon, names), weapon].filter(Boolean);
  for (const w of weapons) {
    const idx = name.toLowerCase().lastIndexOf(w.toLowerCase());
    if (idx >= 0) {
      name = name.slice(0, idx) + name.slice(idx + w.length);
      break;
    }
  }
  return name.trim().toLowerCase();
}

export function tiersOf(skins: OwnedSkin[]): SkinTier[] {
  const map = new Map<string, SkinTier>();
  for (const s of skins) {
    if (!map.has(s.content_tier_uuid)) {
      map.set(s.content_tier_uuid, {
        id: s.content_tier_uuid,
        name: s.content_tier_name,
        color: s.content_tier_color ? `#${s.content_tier_color.slice(0, 6)}` : '',
      });
    }
  }
  return [...map.values()];
}

export function filterSkins<T extends OwnedSkin>(
  skins: T[],
  query: string,
  weaponFilter: Set<string>,
  tierFilter: Set<string>,
  names: Record<string, string>,
): T[] {
  const q = query.trim().toLowerCase();
  return skins.filter((s) => {
    if (weaponFilter.size && !weaponFilter.has(s.weapon ?? '')) return false;
    if (tierFilter.size && !tierFilter.has(s.content_tier_uuid)) return false;
    if (q && !searchableName(s, names).includes(q)) return false;
    return true;
  });
}

// Inventory order: rarity first, then knives, Vandal, Phantom, the rest of the weapons, then name.
const TIER_ORDER = ['exclusive', 'ultra', 'premium', 'deluxe', 'select'];
const WEAPON_ORDER = [
  'melee', 'vandal', 'phantom', 'operator', 'sheriff', 'ghost', 'classic', 'guardian', 'spectre',
  'bulldog', 'ares', 'odin', 'judge', 'bucky', 'marshal', 'outlaw', 'stinger', 'frenzy', 'shorty',
];

function rankIn(order: string[], value: string | undefined): number {
  const i = order.indexOf((value ?? '').toLowerCase().replace(/ edition$/, ''));
  return i === -1 ? order.length : i;
}

export function sortSkins<T extends OwnedSkin>(skins: T[]): T[] {
  return [...skins].sort(
    (a, b) =>
      rankIn(TIER_ORDER, a.content_tier_name) - rankIn(TIER_ORDER, b.content_tier_name) ||
      rankIn(WEAPON_ORDER, a.weapon) - rankIn(WEAPON_ORDER, b.weapon) ||
      a.name.localeCompare(b.name),
  );
}
