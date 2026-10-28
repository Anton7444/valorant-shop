import { useState } from 'react';
import * as api from '../api/client';

/** Makes a code that signs this account in on another computer (typed on the login page there). */
export default function LoginCodePanel() {
  const [code, setCode] = useState<{ code: string; minutes: number; renews: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function make() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await api.createLoginCode();
      setCode({ code: res.code, minutes: Math.round(res.expires_in / 60), renews: res.renews });
    } catch (err) {
      setCode(null);
      setError(err instanceof Error ? err.message : 'Could not create a code');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
    } catch {
      // clipboard unavailable: the code is on screen anyway
    }
  }

  return (
    <div className="rise-in rounded-lg border border-border bg-bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm uppercase tracking-widest text-text-primary">Use this account on another computer</h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-text-secondary">
            Get a code here, then on the other computer open this site, expand "Can't open Riot's login page here?" on the
            login page and enter it. That computer never has to open Riot's page.
          </p>
        </div>
        <button
          type="button"
          onClick={make}
          disabled={busy}
          className="font-display rounded-sm border border-accent-red/60 px-4 py-2 text-xs uppercase tracking-widest text-accent-red transition-colors hover:bg-accent-red/10 disabled:opacity-50"
        >
          {code ? 'New code' : 'Get a code'}
        </button>
      </div>

      {code && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="rounded-sm border border-border bg-bg-secondary px-4 py-2 font-mono text-xl tracking-[0.25em] text-text-primary">
            {code.code}
          </span>
          <button
            type="button"
            onClick={copy}
            className="text-xs text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <span className="text-xs text-text-secondary">
            {code.renews
              ? 'Valid for 24 hours.'
              : `Works for about ${code.minutes} minutes (Riot's login runs out after about an hour). Sign in with the login helper extension to make it last 24 hours.`}
          </span>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-accent-red">{error}</p>}
    </div>
  );
}
