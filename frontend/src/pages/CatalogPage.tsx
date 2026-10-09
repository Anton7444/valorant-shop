import { useEffect, useMemo, useState } from 'react';
import * as api from '../api/client';
import type { CatalogSkin } from '../types';
import { useLanguage } from '../context/useLanguage';
import AppHeader from '../components/AppHeader';
import SkinCollectionCard from '../components/SkinCollectionCard';
import SkinFilters from '../components/SkinFilters';
import { filterSkins, tiersOf, toggle } from '../utils/skinFilters';
import { localizedName } from '../context/languageNames';

const PAGE_SIZE = 60;

// Public page: the catalog is static game data, so no login is needed.
export default function CatalogPage() {
  const { localizedNames } = useLanguage();
  const [skins, setSkins] = useState<CatalogSkin[]>([]);
  const [weapons, setWeapons] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [weaponFilter, setWeaponFilter] = useState<Set<string>>(new Set());
  const [tierFilter, setTierFilter] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    api
      .getCatalog()
      .then((res) => {
        setSkins(res.skins);
        setWeapons(res.weapons);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load catalog'))
      .finally(() => setLoading(false));
  }, []);

  const tiers = useMemo(() => tiersOf(skins), [skins]);
  const filtered = useMemo(
    () => filterSkins(skins, query, weaponFilter, tierFilter, localizedNames),
    [skins, query, weaponFilter, tierFilter, localizedNames],
  );
  const hasFilters = weaponFilter.size > 0 || tierFilter.size > 0 || query !== '';

  return (
    <div className="min-h-dvh">
      <AppHeader />

      <main id="main" className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl uppercase tracking-[0.18em] text-text-primary">
            Skin catalog {!loading && !error && <span className="text-text-secondary">({filtered.length})</span>}
          </h2>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE_SIZE);
            }}
            placeholder="Search skins..."
            className="rounded-sm border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary/50 focus:border-accent-red"
          />
        </div>

        {!loading && !error && (
          <SkinFilters
            weapons={weapons}
            tiers={tiers}
            weaponFilter={weaponFilter}
            tierFilter={tierFilter}
            hasFilters={hasFilters}
            onToggleWeapon={(w) => {
              setWeaponFilter((cur) => toggle(cur, w));
              setLimit(PAGE_SIZE);
            }}
            onToggleTier={(t) => {
              setTierFilter((cur) => toggle(cur, t));
              setLimit(PAGE_SIZE);
            }}
            onClear={() => {
              setWeaponFilter(new Set());
              setTierFilter(new Set());
              setQuery('');
              setLimit(PAGE_SIZE);
            }}
          />
        )}

        {loading ? (
          <p className="py-20 text-center text-text-secondary">Loading...</p>
        ) : error ? (
          <p className="py-20 text-center text-accent-red">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="py-20 text-center text-text-secondary">No skins found.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {filtered.slice(0, limit).map((skin, index) => (
                <SkinCollectionCard
                  key={skin.uuid}
                  skin={skin}
                  index={index}
                  subtitle={localizedName(skin.weapon, skin.weapon, localizedNames)}
                />
              ))}
            </div>
            {filtered.length > limit && (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => setLimit((n) => n + PAGE_SIZE)}
                  className="rounded-sm border border-border bg-bg-secondary px-5 py-2 text-xs font-semibold uppercase tracking-widest text-text-secondary transition-colors hover:border-accent-red hover:text-text-primary"
                >
                  Show more ({filtered.length - limit})
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
