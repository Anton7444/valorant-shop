import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../context/useLanguage';
import * as api from '../api/client';
import type { AccessoryOffer } from '../types';
import AppHeader from '../components/AppHeader';
import CountdownTimer from '../components/CountdownTimer';
import { localizedName } from '../context/languageNames';
import { staggerStyle, trackPointer } from '../utils/spotlight';

const TYPE_LABELS: Record<AccessoryOffer['item_type'], string> = {
  spray: 'Spray',
  buddy: 'Gun buddy',
  card: 'Player card',
  title: 'Title',
  other: 'Item',
};

export default function AccessoryPage() {
  const { dispatch } = useAuth();
  const navigate = useNavigate();
  const [offers, setOffers] = useState<AccessoryOffer[]>([]);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAccessoryStore();
      setOffers(res.offers);
      setSecondsRemaining(res.seconds_remaining);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load the accessory store';
      if (message.includes('401') || message.includes('Not authenticated') || message.includes('Session expired')) {
        dispatch({ type: 'LOGOUT' });
        navigate('/', { replace: true });
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [dispatch, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-dvh">
      <AppHeader />

      <main id="main" className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 flex items-center gap-3">
          <span className="h-5 w-1 bg-accent-red" aria-hidden="true" />
          <h2 className="font-display text-xl uppercase tracking-[0.18em] text-text-primary">Accessory store</h2>
        </div>

        {loading ? (
          <div className="animate-pulse">
            <div className="mb-8 flex justify-center">
              <div className="h-7 w-72 rounded bg-bg-card" />
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-60 rounded-lg border border-border bg-bg-card" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <p className="text-accent-red">{error}</p>
            <button
              onClick={load}
              className="rounded bg-accent-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-110"
            >
              Retry
            </button>
          </div>
        ) : offers.length === 0 ? (
          <p className="py-20 text-center text-sm text-text-secondary">No accessory offers right now.</p>
        ) : (
          <>
            <div className="mb-8 flex justify-center">
              <CountdownTimer secondsRemaining={secondsRemaining} onExpire={load} />
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {offers.map((offer, index) => (
                <AccessoryCard key={offer.uuid} offer={offer} index={index} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function AccessoryCard({ offer, index }: { offer: AccessoryOffer; index: number }) {
  const { localizedNames } = useLanguage();
  const name = localizedName(offer.uuid, offer.name, localizedNames);

  return (
    <div
      className="card-motion card-spotlight rise-in flex flex-col overflow-hidden rounded-lg border border-border bg-bg-card"
      onPointerMove={trackPointer}
      style={staggerStyle(index)}
    >
      <div className="flex h-40 items-center justify-center bg-bg-secondary p-4">
        {offer.display_icon ? (
          <img src={offer.display_icon} alt={name} loading="lazy" className="max-h-full max-w-full object-contain" />
        ) : (
          <p className="text-center font-display text-lg uppercase tracking-wider text-text-primary">{name}</p>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 border-t border-border px-4 py-3">
        <span className="text-[11px] uppercase tracking-widest text-text-secondary">{TYPE_LABELS[offer.item_type]}</span>
        <h3 className="line-clamp-2 text-sm font-semibold text-text-primary">{name}</h3>
        <p className="mt-auto pt-2 text-sm font-semibold" style={{ color: '#e8c15a' }}>
          {offer.cost.toLocaleString()} <span className="text-xs font-normal text-text-secondary">KC</span>
        </p>
      </div>
    </div>
  );
}
