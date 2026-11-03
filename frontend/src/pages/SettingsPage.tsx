import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';
import AppHeader from '../components/AppHeader';
import GoogleSignIn from '../components/GoogleSignIn';
import { applyAccountSettings } from '../utils/accountSettings';
import { setMetalCards, useMetalCards } from '../utils/metalCards';
import { setVideoViaServer, useVideoViaServer } from '../utils/videoRoute';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border/70 bg-bg-secondary/90 p-6">
      <h2 className="mb-4 font-display text-sm uppercase tracking-[0.18em] text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-[var(--color-accent-red)]"
      />
      <span>
        <span className="block text-sm text-text-primary">{label}</span>
        <span className="block text-xs leading-relaxed text-text-secondary/80">{hint}</span>
      </span>
    </label>
  );
}

const buttonClass =
  'rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-text-primary transition-colors hover:border-accent-red disabled:opacity-50';

export default function SettingsPage() {
  const { state, dispatch } = useAuth();
  const navigate = useNavigate();
  const account = state.account;
  const metal = useMetalCards();
  const viaServer = useVideoViaServer();

  const [cookies, setCookies] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggle(key: 'metal_cards' | 'video_via_server', on: boolean) {
    if (key === 'metal_cards') setMetalCards(on);
    else setVideoViaServer(on);
    if (account) {
      api
        .saveAccountSettings({ [key]: on })
        .then((info) => dispatch({ type: 'ACCOUNT_UPDATED', account: info }))
        .catch(() => setMessage({ kind: 'error', text: 'Could not save this setting to your account.' }));
    }
  }

  async function handleGoogle(credential: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.googleLogin(credential);
      if (res.status === 'success' && res.session_token && res.account) {
        api.storeToken(res.session_token);
        applyAccountSettings(res.account.settings);
        dispatch({ type: 'LOGIN_SUCCESS', puuid: res.account.riot.puuid, account: res.account });
      } else {
        setMessage({ kind: 'error', text: res.error ?? 'Google sign-in failed' });
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Google sign-in failed' });
    } finally {
      setBusy(false);
    }
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!cookies.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.linkRiot(cookies.trim());
      if (res.status === 'success' && res.account) {
        dispatch({ type: 'ACCOUNT_UPDATED', account: res.account });
        setCookies('');
      } else {
        setMessage({ kind: 'error', text: res.error ?? 'Could not link the Riot account' });
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Could not link the Riot account' });
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.unlinkRiot();
      if (res.account) dispatch({ type: 'ACCOUNT_UPDATED', account: res.account });
      setMessage({ kind: 'ok', text: 'The stored Riot cookies were deleted.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Could not unlink' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await api.logout().catch(() => {});
    dispatch({ type: 'LOGOUT' });
    navigate('/', { replace: true });
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await api.deleteGoogleAccount();
      dispatch({ type: 'LOGOUT' });
      navigate('/', { replace: true });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Could not delete the account' });
      setBusy(false);
    }
  }

  const riotState = account?.riot.state;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <h1 className="font-display text-2xl uppercase tracking-[0.18em] text-text-primary">Settings</h1>

        {message && (
          <p
            role="status"
            className={`rounded-sm border px-3 py-2 text-sm ${
              message.kind === 'ok' ? 'border-accent-teal/40 text-accent-teal' : 'border-accent-red/40 text-accent-red'
            }`}
          >
            {message.text}
          </p>
        )}

        <Section title="Account">
          {account ? (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Signed in with Google as <span className="text-text-primary">{account.email}</span>. Your linked Riot
                login and these settings follow you to every device you sign in on.
              </p>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => void handleSignOut()} className={buttonClass}>
                  Sign out
                </button>
                {confirmDelete ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete()}
                      className="rounded-sm border border-accent-red bg-accent-red/15 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-accent-red disabled:opacity-50"
                    >
                      Yes, delete everything
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} className={buttonClass}>
                    Delete account
                  </button>
                )}
              </div>
              {confirmDelete && (
                <p className="text-xs leading-relaxed text-text-secondary/80">
                  This deletes your account, the stored Riot cookies, your saved settings and signs out every device.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Sign in with Google to link your Riot login to your account. Then the shop works on every device and
                you never have to log in to Riot again.
              </p>
              <GoogleSignIn onCredential={(c) => void handleGoogle(c)} busy={busy} />
            </div>
          )}
        </Section>

        {account && (
          <Section title="Riot login">
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Status:{' '}
                {riotState === 'linked' ? (
                  <span className="text-accent-teal">linked{account.riot.puuid ? ` (${account.riot.puuid.slice(0, 8)})` : ''}</span>
                ) : riotState === 'expired' ? (
                  <span className="text-accent-red">expired &mdash; link it again</span>
                ) : (
                  <span className="text-text-primary">not linked</span>
                )}
              </p>
              <form onSubmit={(e) => void handleLink(e)} className="space-y-3">
                <textarea
                  value={cookies}
                  onChange={(e) => setCookies(e.target.value)}
                  placeholder="Paste the exported cookies of auth.riotgames.com"
                  aria-label="Riot cookies"
                  rows={4}
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full resize-none rounded border border-border bg-bg-primary px-3 py-2.5 text-xs text-text-primary placeholder-text-secondary/50 outline-none transition-colors focus:border-accent-red"
                />
                <div className="flex flex-wrap gap-3">
                  <button type="submit" disabled={busy || !cookies.trim()} className={buttonClass}>
                    {riotState === 'linked' ? 'Replace Riot login' : 'Link Riot account'}
                  </button>
                  {riotState === 'linked' && (
                    <button type="button" disabled={busy} onClick={() => void handleUnlink()} className={buttonClass}>
                      Unlink and delete cookies
                    </button>
                  )}
                </div>
              </form>
              <div className="space-y-2 text-xs leading-relaxed text-text-secondary/80">
                <p>
                  How: log in at account.riotgames.com in a private window, then export the cookies of{' '}
                  <span className="text-text-primary">auth.riotgames.com</span> (for example with the Cookie-Editor
                  extension, JSON or Netscape format) and paste them here.
                </p>
                <p>
                  The cookies are stored encrypted on the server and used only to renew your Riot login by itself. Use a
                  separate private-window login for this, not the one other tools use. If you stop using the account for
                  30 days the stored cookies are deleted automatically.
                </p>
              </div>
            </div>
          </Section>
        )}

        <Section title="Display">
          <Toggle
            label="Metal card effect"
            hint="The shiny metallic look on skin cards."
            checked={metal}
            onChange={(on) => toggle('metal_cards', on)}
          />
          <Toggle
            label="Load videos through the server"
            hint="Plays skin videos via this site's server instead of directly. Turn on if videos do not load on your network."
            checked={viaServer}
            onChange={(on) => toggle('video_via_server', on)}
          />
          {!account && (
            <p className="mt-2 text-xs text-text-secondary/70">These settings are saved in this browser. Sign in with Google to keep them on every device.</p>
          )}
        </Section>
      </main>
    </div>
  );
}
