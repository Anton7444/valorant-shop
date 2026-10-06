import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';
import type { OwnedSkin } from '../types';
import { useLanguage } from '../context/useLanguage';
import AppHeader from '../components/AppHeader';
import { localizedName } from '../context/languageNames';
import SkinCollectionCard from '../components/SkinCollectionCard';

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
    <div className="min-h-dvh">
      <AppHeader />

      <main id="main" className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl uppercase tracking-[0.18em] text-text-primary">
            My skins {!loading && !error && <span className="text-text-secondary">({skins.length})</span>}
          </h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skins..."
            className="rounded-sm border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary/50 focus:border-accent-red"
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
            {filtered.map((skin, index) => (
              <SkinCollectionCard key={skin.uuid} skin={skin} index={index} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
