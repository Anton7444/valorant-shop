import { useEffect, useState } from 'react';
import * as api from '../api/client';
import {
  CHANGE_EVENT,
  isAutoSyncOn,
  lastAutoSync,
  rememberCode,
  rememberedCode,
  setAutoSync,
} from '../utils/autoSync';

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
  const [auto, setAuto] = useState(isAutoSyncOn);
  const [lastSync, setLastSync] = useState(lastAutoSync);

  useEffect(() => {
    const sync = () => {
      setAuto(isAutoSyncOn());
      setLastSync(lastAutoSync());
    };
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);

  // A browser that is itself looking at a snapshot has nothing live to save.
  if (api.getSnapshotTime() !== null) return null;

  async function take() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await api.createSnapshot(rememberedCode());
      rememberCode(res.code);
      setSnap({ code: res.code, takenAt: res.taken_at, parts: res.parts, days: Math.round(res.expires_in / 86400) });
    } catch (err) {
      setSnap(null);
      setError(err instanceof Error ? err.message : 'Could not save a snapshot');
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!snap) return;
    setBusy(true);
    try {
      await api.revokeSnapshot(snap.code);
      localStorage.removeItem('autosync_code');
      setAutoSync(false);
      setAuto(false);
      setSnap(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not stop sharing');
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
          <button
            type="button"
            onClick={stop}
            disabled={busy}
            className="text-xs text-text-secondary underline-offset-2 hover:text-accent-red hover:underline disabled:opacity-50"
          >
            Stop sharing
          </button>
          <span className="text-xs text-text-secondary">
            Saved {new Date(snap.takenAt * 1000).toLocaleTimeString()}. {snap.days > 0 ? `The code works for ${snap.days} days` : 'The code never expires'} and the other computer stays signed in. Includes:{' '}
            {snap.parts.map((p) => PART_LABELS[p] ?? p).join(', ')}. Save again when the store changes.
          </span>
        </div>
      )}
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs text-text-secondary">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => {
            setAutoSync(e.target.checked);
            setAuto(e.target.checked);
          }}
          className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-accent-red)]"
        />
        <span>
          <span className="text-text-primary">Keep it updated automatically.</span> About every 20 minutes this tab signs in
          to Riot again by itself (it briefly leaves and comes back) and saves fresh data under the same code, so the
          other computer shows live data: each page it opens is fetched from Riot at that moment. Needs this
          computer on, this site open, the login helper extension installed and Riot's sign-in still remembered in this
          browser.
          {auto && lastSync > 0 && <> Last update {new Date(lastSync).toLocaleTimeString()}.</>}
        </span>
      </label>
      {error && <p className="mt-3 text-xs text-accent-red">{error}</p>}
    </div>
  );
}
