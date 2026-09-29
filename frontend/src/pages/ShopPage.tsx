import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';
import type { Bundle, SkinOffer, Wallet } from '../types';
import CountdownTimer from '../components/CountdownTimer';
import AppHeader from '../components/AppHeader';
import SkinCard from '../components/SkinCard';
import BundleCard from '../components/BundleCard';

const STORE_SEEN_KEY = 'valshop:lastSeenStoreKey';

export default function ShopPage() {
  const { dispatch } = useAuth();
  const navigate = useNavigate();

  const [offers, setOffers] = useState<SkinOffer[]>([]);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNewStore, setIsNewStore] = useState(true);

  const fetchStoreData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [dailyRes, bundleRes, walletRes] = await Promise.all([
        api.getDailyStore(),
        api.getBundles(),
        api.getWallet(),
      ]);

      const storeKey = dailyRes.offers.map((offer) => offer.uuid).sort().join(',');
      const lastSeenKey = localStorage.getItem(STORE_SEEN_KEY);
      setIsNewStore(storeKey !== lastSeenKey);
      if (storeKey) {
        localStorage.setItem(STORE_SEEN_KEY, storeKey);
      }

      setOffers(dailyRes.offers);
      setSecondsRemaining(dailyRes.seconds_remaining);
      setBundles(bundleRes.bundles);
      setWallet(walletRes);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load store';
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
    fetchStoreData();
  }, [fetchStoreData]);

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-sm focus:bg-accent-red focus:px-3 focus:py-2 focus:text-sm focus:text-white">Skip to content</a>
      <AppHeader wallet={wallet} />

      {/* Main content */}
      <main id="main" className="mx-auto max-w-6xl px-4 py-10">
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <p className="text-accent-red">{error}</p>
            <button
              onClick={fetchStoreData}
              className="rounded bg-accent-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-110"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Countdown */}
            <div className="mb-8 flex justify-center">
              <CountdownTimer
                secondsRemaining={secondsRemaining}
                onExpire={fetchStoreData}
              />
            </div>

            {/* Daily Store */}
            <section className="mb-12">
              <SectionHeading>Daily store</SectionHeading>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {offers.map((skin) => (
                  <SkinCard key={skin.uuid} skin={skin} startRevealed={!isNewStore} />
                ))}
              </div>
            </section>

            {/* Featured Bundle */}
            {bundles.length > 0 && (
              <section>
                <SectionHeading>Featured bundle</SectionHeading>
                <div className="space-y-4">
                  {bundles.map((bundle) => (
                    <BundleCard key={bundle.uuid} bundle={bundle} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="h-5 w-1 bg-accent-red" aria-hidden="true" />
      <h2 className="font-display text-xl uppercase tracking-[0.18em] text-text-primary">{children}</h2>
      <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" aria-hidden="true" />
    </div>
  );
}

function SkinCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-card">
      <div className="h-0.5 bg-bg-secondary" />
      <div className="flex aspect-video items-center justify-center p-4">
        <div className="h-3/4 w-3/4 rounded bg-bg-secondary/50" />
      </div>
      <div className="flex items-end justify-between border-t border-border p-4">
        <div className="space-y-2">
          <div className="h-5 w-32 rounded bg-bg-secondary" />
          <div className="h-4 w-16 rounded-sm bg-bg-secondary" />
        </div>
        <div className="h-5 w-20 rounded bg-bg-secondary" />
      </div>
    </div>
  );
}

function BundleCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="h-6 w-40 rounded bg-bg-secondary" />
        <div className="h-5 w-24 rounded bg-bg-secondary" />
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center rounded border border-border/50 bg-bg-secondary p-2">
            <div className="mb-2 h-16 w-full rounded bg-bg-primary/30" />
            <div className="h-3 w-20 rounded bg-bg-primary/30" />
            <div className="mt-1 h-3 w-12 rounded bg-bg-primary/30" />
          </div>
        ))}
      </div>
      <div className="flex justify-end border-t border-border px-6 py-4">
        <div className="h-6 w-28 rounded bg-bg-secondary" />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Countdown placeholder */}
      <div className="mb-8 flex justify-center">
        <div className="h-7 w-72 rounded bg-bg-card" />
      </div>

      {/* Section heading */}
      <div className="mb-6 h-8 w-40 rounded bg-bg-card" />

      {/* Skin cards grid */}
      <div className="mb-12 grid grid-cols-1 gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <SkinCardSkeleton key={i} />
        ))}
      </div>

      {/* Bundle heading */}
      <div className="mb-6 h-8 w-52 rounded bg-bg-card" />

      {/* Bundle card */}
      <BundleCardSkeleton />
    </div>
  );
}
