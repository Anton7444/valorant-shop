import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';
import type { CatalogSkin } from '../types';
import { useLanguage } from '../context/useLanguage';
import AppHeader from '../components/AppHeader';
import SkinCollectionCard from '../components/SkinCollectionCard';
import { localizedName } from '../context/languageNames';

const PAGE_SIZE = 60;

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-sm border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
        active
          ? 'border-accent-red bg-accent-red/10 text-text-primary'
          : 'border-border bg-bg-secondary text-text-secondary hover:text-text-primary'
      }`}
    >
      {color && <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: color }} />}
      {children}
    </button>
  );
}

function toggle(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

export default function CatalogPage() {
  const { dispatch } = useAuth();
  const navigate = useNavigate();
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
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load catalog';
        if (message.includes('401') || message.includes('Not authenticated') || message.includes('Session expired')) {
          dispatch({ type: 'LOGOUT' });
          navigate('/', { replace: true });
          return;
        }
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [dispatch, navigate]);

  const tiers = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const s of skins) {
      if (!map.has(s.content_tier_uuid)) {
        map.set(s.content_tier_uuid, {
          name: s.content_tier_name,
          color: s.content_tier_color ? `#${s.content_tier_color.slice(0, 6)}` : '',
        });
      }
    }
    return [...map.entries()];
  }, [skins]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skins.filter((s) => {
      if (weaponFilter.size && !weaponFilter.has(s.weapon)) return false;
      if (tierFilter.size && !tierFilter.has(s.content_tier_uuid)) return false;
      if (q && !localizedName(s.uuid, s.name, localizedNames).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [skins, query, weaponFilter, tierFilter, localizedNames]);

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
          <div className="mb-8 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 w-14 text-[11px] uppercase tracking-widest text-text-secondary">Weapon</span>
              {weapons.map((w) => (
                <FilterChip
                  key={w}
                  active={weaponFilter.has(w)}
                  onClick={() => {
                    setWeaponFilter((cur) => toggle(cur, w));
                    setLimit(PAGE_SIZE);
                  }}
                >
                  {w}
                </FilterChip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 w-14 text-[11px] uppercase tracking-widest text-text-secondary">Tier</span>
              {tiers.map(([id, tier]) => (
                <FilterChip
                  key={id}
                  active={tierFilter.has(id)}
                  color={tier.color}
                  onClick={() => {
                    setTierFilter((cur) => toggle(cur, id));
                    setLimit(PAGE_SIZE);
                  }}
                >
                  {tier.name}
                </FilterChip>
              ))}
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setWeaponFilter(new Set());
                    setTierFilter(new Set());
                    setQuery('');
                    setLimit(PAGE_SIZE);
                  }}
                  className="ml-2 text-xs text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
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
                <SkinCollectionCard key={skin.uuid} skin={skin} index={index} subtitle={skin.weapon} />
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
