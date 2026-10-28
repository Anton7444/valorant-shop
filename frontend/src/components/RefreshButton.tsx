import { useEffect, useRef, useState } from 'react';
import * as api from '../api/client';

const POLL_MS = 4000;
const GIVE_UP_MS = 120_000;

/** For a snapshot view: fetch fresh data now, asking the home computer to sign in again if its Riot sign-in ran out. */
export default function RefreshButton() {
  const [state, setState] = useState<'idle' | 'working' | 'waiting' | 'failed'>('idle');
  const timer = useRef(0);

  useEffect(() => () => window.clearInterval(timer.current), []);

  async function refresh() {
    setState('working');
    try {
      const res = await api.refreshSnapshot();
      if (res.live) {
        window.location.reload();
        return;
      }
      // The home computer's sign-in has run out: it was asked to sign in again. Wait until it has.
      setState('waiting');
      const started = Date.now();
      window.clearInterval(timer.current);
      timer.current = window.setInterval(async () => {
        try {
          const session = await api.checkSession();
          if (session.live) {
            if (session.snapshot_at) api.storeSnapshotTime(session.snapshot_at);
            api.storeSnapshotLive(true);
            window.clearInterval(timer.current);
            window.location.reload();
          } else if (Date.now() - started > GIVE_UP_MS) {
            window.clearInterval(timer.current);
            setState('failed');
          }
        } catch {
          window.clearInterval(timer.current);
          setState('failed');
        }
      }, POLL_MS);
    } catch {
      setState('failed');
    }
  }

  const label =
    state === 'working' ? 'Refreshing…' : state === 'waiting' ? 'Asking home…' : state === 'failed' ? 'No answer' : 'Refresh';

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={state === 'working' || state === 'waiting'}
      title={
        state === 'failed'
          ? 'The home computer did not answer: it must be on, with this site open and "Keep it updated automatically" ticked'
          : 'Fetch fresh data (asks the home computer to sign in again if needed)'
      }
      className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-text-secondary transition-colors hover:border-accent-teal hover:text-accent-teal disabled:opacity-60"
    >
      {label}
    </button>
  );
}
