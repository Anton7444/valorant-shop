import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { Bundle } from '../types';
import AppHeader from '../components/AppHeader';
import { BundleSkeleton } from '../components/Skeletons';
import BundleCard from '../components/BundleCard';

// Public page: shows the last featured bundle a signed-in player loaded, so no
// login is needed to look at it.
export default function BundlePage() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPublicBundles()
      .then((res) => setBundles(res.bundles))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the featured bundle'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-dvh">
      <AppHeader />

      <main id="main" className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="font-display mb-6 text-xl uppercase tracking-[0.18em] text-text-primary">
          Featured bundle
        </h2>

        {loading ? (
          <BundleSkeleton />
        ) : error ? (
          <p className="py-20 text-center text-accent-red">{error}</p>
        ) : bundles.length === 0 ? (
          <p className="mx-auto max-w-md py-20 text-center text-sm leading-relaxed text-text-secondary">
            The featured bundle isn't available right now. It shows up here after anyone signs in and
            opens the store.
          </p>
        ) : (
          <div className="space-y-4">
            {bundles.map((bundle) => (
              <BundleCard key={bundle.uuid} bundle={bundle} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
