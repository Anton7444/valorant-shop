import { useState } from 'react';
import * as api from '../api/client';

const PART_LABELS: Record<string, string> = {
  daily: 'daily store',
  accessories: 'accessories',
  bundle: 'bundle',
  wallet: 'wallet',
  inventory: 'inventory',
  profile: 'profile and matches',
  battlepass: 'battle pass',
};

/** Saves everything the site shows now and gives a code to open it on a computer that cannot reach Riot. */
export default function SnapshotPanel() {
  const [snap, setSnap] = useState<{ code: string; takenAt: number; parts: string[]; days: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // A browser that is itself looking at a snapshot has nothing live to save.
  if (api.getSnapshotTime() !== null) return null;

  async function take() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await api.createSnapshot();
      setSnap({ code: res.code, takenAt: res.taken_at, parts: res.parts, days: Math.round(res.expires_in / 86400) });
    } catch (err) {
      setSnap(null);
      setError(err instanceof Error ? err.message : 'Could not save a snapshot');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!snap) return;
    try {
      await navigator.clipboard.writeText(snap.code);
      setCopied(true);
    } catch {
      // clipboard unavailable: the code is on screen anyway
    }
  }

  return (
    <div className="rise-in rounded-lg border border-border bg-bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm uppercase tracking-widest text-text-primary">Open this on another computer</h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-text-secondary">
            Saves your store, accessories, bundle, wallet, inventory, profile, matches and battle pass as they are now and
            gives a code. On the other computer, expand "Can't open Riot's login page here?" on the login page and enter
            the code: it shows this saved data without ever talking to Riot.
          </p>
        </div>
        <button
          type="button"
          onClick={take}
          disabled={busy}
          className="font-display rounded-sm border border-accent-red/60 px-4 py-2 text-xs uppercase tracking-widest text-accent-red transition-colors hover:bg-accent-red/10 disabled:opacity-50"
        >
          {busy ? 'Saving…' : snap ? 'Save again' : 'Save a snapshot'}
        </button>
      </div>

      {snap && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="rounded-sm border border-border bg-bg-secondary px-4 py-2 font-mono text-xl tracking-[0.25em] text-text-primary">
            {snap.code}
          </span>
          <button
            type="button"
            onClick={copy}
            className="text-xs text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <span className="text-xs text-text-secondary">
            Saved {new Date(snap.takenAt * 1000).toLocaleTimeString()}. The code works for {snap.days} days and the other computer stays signed in. Includes:{' '}
            {snap.parts.map((p) => PART_LABELS[p] ?? p).join(', ')}. Save again when the store changes.
          </span>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-accent-red">{error}</p>}
    </div>
  );
}
