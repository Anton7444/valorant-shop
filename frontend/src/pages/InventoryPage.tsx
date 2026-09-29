import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';
import type { OwnedSkin } from '../types';
import { useLanguage } from '../context/useLanguage';
import { localizedName } from '../context/languageNames';
import SkinVideoModal from '../components/SkinVideoModal';

function tierColor(skin: OwnedSkin): string {
  return skin.content_tier_color ? `#${skin.content_tier_color.slice(0, 6)}` : 'var(--color-text-secondary)';
}

export default function InventoryPage() {
  const { dispatch } = useAuth();
  const navigate = useNavigate();
  const { localizedNames } = useLanguage();
  const [skins, setSkins] = useState<OwnedSkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api
      .getInventory()
      .then((res) => setSkins(res.skins))
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load inventory';
        if (message.includes('401') || message.includes('Not authenticated') || message.includes('Session expired')) {
          dispatch({ type: 'LOGOUT' });
          navigate('/', { replace: true });
          return;
        }
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [dispatch, navigate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skins;
    return skins.filter((s) => localizedName(s.uuid, s.name, localizedNames).toLowerCase().includes(q));
  }, [skins, query, localizedNames]);

  return (
    <div className="min-h-svh bg-bg-primary">
      <header className="sticky top-0 z-10 border-b border-border bg-bg-secondary/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <h1
            className="text-lg tracking-wider text-text-primary"
            style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}
          >
            VAL<span className="text-accent-red">SHOP</span>
          </h1>
          <Link
            to="/shop"
            className="rounded border border-border px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-text-secondary transition-colors hover:border-accent-red hover:text-accent-red"
          >
            Back to Store
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2
            className="text-2xl tracking-wider text-text-primary"
            style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}
          >
            MY SKINS {!loading && !error && <span className="text-text-secondary">({skins.length})</span>}
          </h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skins..."
            className="rounded border border-border bg-bg-secondary px-3 py-1.5 text-sm text-text-primary"
          />
        </div>

        {loading ? (
          <p className="py-20 text-center text-text-secondary">Loading...</p>
        ) : error ? (
          <p className="py-20 text-center text-accent-red">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="py-20 text-center text-text-secondary">No skins found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {filtered.map((skin) => (
              <InventoryCard key={skin.uuid} skin={skin} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function InventoryCard({ skin }: { skin: OwnedSkin }) {
  const { localizedNames } = useLanguage();
  const color = tierColor(skin);
  const name = localizedName(skin.uuid, skin.name, localizedNames);
  const hasVideo = skin.levels.some((level) => level.video_url);
  const imageRef = useRef<HTMLDivElement>(null);
  const [videoOrigin, setVideoOrigin] = useState<DOMRect | null>(null);

  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-border bg-bg-card"
      style={{ '--glow-color': color } as React.CSSProperties}
    >
      <div className="h-0.5" style={{ backgroundColor: color }} />
      <div
        ref={imageRef}
        onClick={() => hasVideo && imageRef.current && setVideoOrigin(imageRef.current.getBoundingClientRect())}
        role={hasVideo ? 'button' : undefined}
        aria-label={hasVideo ? `Play ${name} demo video` : undefined}
        className="relative flex aspect-video items-center justify-center p-4"
        style={{ cursor: hasVideo ? 'pointer' : 'default' }}
      >
        {skin.display_icon ? (
          <img src={skin.display_icon} alt={name} loading="lazy" className="h-full w-full object-contain drop-shadow-lg" />
        ) : (
          <span className="text-sm text-text-secondary">No image</span>
        )}
        {hasVideo && (
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            style={{ boxShadow: 'inset 0 0 0 2px var(--glow-color), inset 0 0 18px -6px var(--glow-color)' }}
          />
        )}
      </div>
      <div className="border-t border-border p-3">
        <h3
          className="truncate text-sm text-text-primary"
          style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600 }}
        >
          {name}
        </h3>
        <span
          className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ backgroundColor: color }}
        >
          {skin.content_tier_name}
        </span>
      </div>
      {videoOrigin && hasVideo && (
        <SkinVideoModal
          levels={skin.levels}
          fallbackIcon={skin.display_icon}
          name={name}
          originRect={videoOrigin}
          onClose={() => setVideoOrigin(null)}
        />
      )}
    </div>
  );
}
