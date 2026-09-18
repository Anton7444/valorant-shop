import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';
import type { Bundle, SkinOffer, Wallet } from '../types';
import CountdownTimer from '../components/CountdownTimer';
import WalletDisplay from '../components/WalletDisplay';
import SkinCard from '../components/SkinCard';
import BundleCard from '../components/BundleCard';

export default function ShopPage() {
  const { state, dispatch } = useAuth();
  const navigate = useNavigate();

  const [offers, setOffers] = useState<SkinOffer[]>([]);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStoreData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [dailyRes, bundleRes, walletRes] = await Promise.all([
        api.getDailyStore(),
        api.getBundles(),
        api.getWallet(),
      ]);

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

  async function handleLogout() {
    await api.logout().catch(() => {});
    dispatch({ type: 'LOGOUT' });
    navigate('/', { replace: true });
  }

  return (
    <div className="min-h-svh bg-bg-primary">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg-secondary/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <h1
              className="text-lg tracking-wider text-text-primary"
              style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}
            >
              VAL<span className="text-accent-red">SHOP</span>
            </h1>
            {state.puuid && (
              <span className="hidden text-xs text-text-secondary sm:block">
                {state.puuid.slice(0, 8)}...
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {wallet && <WalletDisplay wallet={wallet} />}
            <button
              onClick={handleLogout}
              className="rounded border border-border px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-text-secondary transition-colors hover:border-accent-red hover:text-accent-red"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-4 py-8">
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
              <h2
                className="mb-6 text-2xl tracking-wider text-text-primary"
                style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}
              >
                DAILY STORE
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {offers.map((skin) => (
                  <SkinCard key={skin.uuid} skin={skin} />
                ))}
              </div>
            </section>

            {/* Featured Bundle */}
            {bundles.length > 0 && (
              <section>
                <h2
                  className="mb-6 text-2xl tracking-wider text-text-primary"
                  style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}
                >
                  FEATURED BUNDLE
                </h2>
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
          <div className="h-4 w-16 rounded-full bg-bg-secondary" />
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
