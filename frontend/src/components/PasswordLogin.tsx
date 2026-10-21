import { useState } from 'react';
import * as api from '../api/client';

const inputClass =
  'w-full rounded-sm border border-border bg-bg-secondary px-2.5 py-1.5 text-text-primary outline-none focus:border-accent-red';

/** Experimental sign-in: the server logs in to Riot for you. */
export default function PasswordLogin({
  onResponse,
  onError,
}: {
  onResponse: (res: api.LoginResponse) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    setBusy(true);
    try {
      const res = pendingId
        ? await api.passwordMfa(pendingId, code)
        : await api.passwordLogin(username, password);
      if (res.status === 'mfa' && res.pending_id) {
        setPendingId(res.pending_id);
        setPassword('');
      } else {
        if (res.status !== 'success') setPendingId(null);
        setPassword('');
        await onResponse(res);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-3 text-center text-xs text-text-secondary">
      <summary className="cursor-pointer select-none hover:text-text-primary">
        Sign in with username &amp; password (experimental)
      </summary>
      <form onSubmit={submit} className="mx-auto mt-3 max-w-xs space-y-2 text-left">
        {pendingId ? (
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Verification code"
            aria-label="Verification code"
            className={inputClass}
          />
        ) : (
          <>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="Riot username"
              aria-label="Riot username"
              className={inputClass}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Password"
              aria-label="Password"
              className={inputClass}
            />
          </>
        )}
        <button
          type="submit"
          disabled={busy || (pendingId ? !code.trim() : !username.trim() || !password)}
          className="w-full rounded-sm border border-border px-3 py-1.5 font-semibold uppercase tracking-wider text-text-primary transition-colors hover:border-accent-red disabled:opacity-50"
        >
          {busy ? 'Signing in…' : pendingId ? 'Verify' : 'Sign in'}
        </button>
        <p className="text-[11px] text-text-secondary/70">
          Your password goes through this server to Riot and is not stored. Riot may block this; if so, use the normal sign-in.
        </p>
      </form>
    </details>
  );
}
