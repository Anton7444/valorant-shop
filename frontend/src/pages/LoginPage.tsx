import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';
import { finishAutoSync, isSilentSignInPending } from '../utils/autoSync';

type Stage = 'start' | 'paste';

// Try to start with sound (the login click counts as a user gesture); if the
// browser refuses, fall back to muted playback rather than a frozen frame.
function playPromo(video: HTMLVideoElement | null) {
  if (!video) return;
  video.play().catch(() => {
    video.muted = true;
    video.play().catch(() => {});
  });
}

export default function LoginPage() {
  const { state, dispatch } = useAuth();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>(
    () => (sessionStorage.getItem('login_stage') === 'paste' ? 'paste' : 'start')
  );
  const [pastedUrl, setPastedUrl] = useState('');
  const [codeText, setCodeText] = useState('');
  const [accountUser, setAccountUser] = useState('');
  const [accountPass, setAccountPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoSession, setPromoSession] = useState<{ token: string; puuid: string } | null>(null);

  // The login helper extension sends the browser back here with the Riot
  // tokens in the URL fragment; finish the login without any pasting.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes('access_token=')) return;
    // Drop the tokens from the address bar / history right away.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    void finishLogin(`http://localhost/redirect${hash}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClosePromo() {
    if (!promoSession) return;
    api.storeToken(promoSession.token);
    dispatch({ type: 'LOGIN_SUCCESS', puuid: promoSession.puuid });
    navigate('/shop');
  }

  if (promoSession) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <video
          ref={playPromo}
          src={`${import.meta.env.BASE_URL}media/intro.mp4`}
          autoPlay
          playsInline
          loop
          controls
          className="h-full w-full bg-black object-contain"
        />
        <button
          type="button"
          onClick={handleClosePromo}
          aria-label="Close"
          className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center text-white/25 transition-colors hover:text-white/70"
        >
          <svg className="h-2 w-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    );
  }

  if (state.status === 'authenticated') {
    return <Navigate to="/shop" replace />;
  }

  async function handleOpenLogin() {
    setLoading(true);
    setError(null);

    try {
      const { auth_url } = await api.getAuthUrl();
      // With the login helper extension, stay in this tab: it returns here
      // with the login result. Otherwise open a new tab and use manual paste.
      if (document.documentElement.dataset.loginHelper) {
        window.location.assign(auth_url);
        return;
      }
      window.open(auth_url, '_blank', 'noopener');
      sessionStorage.setItem('login_stage', 'paste');
      setStage('paste');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start login');
    } finally {
      setLoading(false);
    }
  }

  async function finishLogin(url: string) {
    setLoading(true);
    setError(null);

    try {
      const res = await api.submitToken(url);

      if (res.status === 'success' && res.promo && res.puuid && res.session_token) {
        sessionStorage.removeItem('login_stage');
        setPromoSession({ token: res.session_token, puuid: res.puuid });
        setLoading(false);
        return;
      }

      if (res.status === 'success' && res.puuid && res.session_token) {
        sessionStorage.removeItem('login_stage');
        api.storeToken(res.session_token);
        dispatch({ type: 'LOGIN_SUCCESS', puuid: res.puuid });
        if (isSilentSignInPending()) {
          // The snapshot auto-update signed in again: save the fresh data, then go back to the profile.
          await finishAutoSync();
          navigate('/profile');
          return;
        }
        navigate('/shop');
      } else {
        setError(res.error ?? 'Authentication failed');
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authenticate');
      setLoading(false);
    }
  }

  async function openView(request: Promise<api.LoginResponse>, fallback: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await request;
      if (res.status === 'success' && res.puuid && res.session_token) {
        api.storeToken(res.session_token);
        if (res.snapshot_at) {
          api.storeSnapshotTime(res.snapshot_at);
          api.storeSnapshotLive(!!res.snapshot_live);
        }
        dispatch({ type: 'LOGIN_SUCCESS', puuid: res.puuid });
        navigate('/shop');
      } else {
        setError(res.error ?? fallback);
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
      setLoading(false);
    }
  }

  function handleAccountLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!accountUser.trim() || !accountPass) return;
    void openView(api.accountLogin(accountUser.trim(), accountPass), 'Could not sign in');
  }

  function handleCodeLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!codeText.trim()) return;
    void openView(api.redeemSnapshot(codeText.trim()), 'Could not open that code');
  }

  function handleSubmitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!pastedUrl.trim()) return;
    void finishLogin(pastedUrl.trim());
  }

  function handleBack() {
    sessionStorage.removeItem('login_stage');
    setStage('start');
    setPastedUrl('');
    setError(null);
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      {/* Angular geometric background accents */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-20 top-1/4 h-px w-80 rotate-[35deg] bg-gradient-to-r from-transparent via-accent-red/20 to-transparent" />
        <div className="absolute -right-10 top-1/3 h-px w-96 -rotate-[25deg] bg-gradient-to-r from-transparent via-accent-red/15 to-transparent" />
        <div className="absolute bottom-1/4 left-1/4 h-px w-64 rotate-[55deg] bg-gradient-to-r from-transparent via-accent-teal/10 to-transparent" />
        <div className="absolute -right-16 bottom-1/3 h-px w-72 rotate-[40deg] bg-gradient-to-r from-transparent via-accent-red/10 to-transparent" />
        <div className="absolute left-1/3 top-16 h-px w-48 -rotate-[15deg] bg-gradient-to-r from-transparent via-border to-transparent" />
        <div className="absolute bottom-20 right-1/4 h-px w-56 rotate-[65deg] bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-md border border-border/70 bg-bg-secondary/90 p-8 shadow-[0_24px_60px_-20px_rgba(4,10,18,0.8)] backdrop-blur">
          <h1
            className="mb-1 text-center text-4xl tracking-wider text-text-primary"
            style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}
          >
            VALORANT <span className="text-accent-red">SHOP</span>
          </h1>
          <p className="mb-8 text-center text-sm text-text-secondary">
            Check your daily store without launching the game
          </p>

          {stage === 'start' ? (
            <>
              <button
                onClick={handleOpenLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded bg-accent-red py-3 text-sm font-bold uppercase tracking-widest text-white transition-all hover:brightness-110 hover:shadow-[0_8px_24px_-8px_rgba(255,70,85,0.6)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                style={{ fontFamily: "'Oswald', sans-serif" }}
              >
                {loading && <Spinner />}
                SIGN IN WITH RIOT
              </button>

              <p className="mt-4 text-center text-xs leading-relaxed text-text-secondary/70">
                A new tab will open for Riot login. After signing in, you'll see
                a <span className="text-accent-red">"can't connect"</span> page —
                that's normal. Copy the URL and come back here to paste it.
              </p>
              <p className="mt-2 text-center text-xs text-text-secondary/70">
                Tired of copying?{' '}
                <a
                  href={`${import.meta.env.BASE_URL}login-helper.zip`}
                  download
                  className="text-text-primary underline underline-offset-2 hover:text-accent-red"
                >
                  Get the login helper extension
                </a>
              </p>

              <details className="mt-4 text-xs text-text-secondary">
                <summary className="cursor-pointer select-none text-center hover:text-text-primary">
                  Can't open Riot's login page here?
                </summary>
                <div className="mt-3 space-y-4 leading-relaxed">
                  <p>
                    Sign in on a computer that can reach Riot, open the Profile page, press{' '}
                    <span className="font-semibold text-text-primary">Save a snapshot</span> and create an account there.
                    Then sign in with that account here: nothing on this computer talks to Riot.
                  </p>
                  <form onSubmit={handleAccountLogin} className="space-y-2">
                    <input
                      value={accountUser}
                      onChange={(e) => setAccountUser(e.target.value)}
                      placeholder="Username"
                      aria-label="Account username"
                      autoCapitalize="off"
                      spellCheck={false}
                      autoComplete="username"
                      className="w-full rounded-sm border border-border bg-bg-primary px-3 py-2 text-text-primary outline-none placeholder:text-text-secondary/50 focus:border-accent-red"
                    />
                    <input
                      type="password"
                      value={accountPass}
                      onChange={(e) => setAccountPass(e.target.value)}
                      placeholder="Password"
                      aria-label="Account password"
                      autoComplete="current-password"
                      className="w-full rounded-sm border border-border bg-bg-primary px-3 py-2 text-text-primary outline-none placeholder:text-text-secondary/50 focus:border-accent-red"
                    />
                    <button
                      type="submit"
                      disabled={loading || !accountUser.trim() || !accountPass}
                      className="w-full rounded-sm border border-border py-2 font-semibold uppercase tracking-wider text-text-primary transition-colors hover:border-accent-red disabled:opacity-50"
                    >
                      Sign in
                    </button>
                  </form>
                  <form onSubmit={handleCodeLogin} className="space-y-2 border-t border-border/60 pt-3">
                    <label htmlFor="snapshot-code" className="block">
                      Or enter a snapshot code
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="snapshot-code"
                        value={codeText}
                        onChange={(e) => setCodeText(e.target.value)}
                        placeholder="XXXXX-XXXXX"
                        autoCapitalize="characters"
                        spellCheck={false}
                        autoComplete="off"
                        className="min-w-0 flex-1 rounded-sm border border-border bg-bg-primary px-3 py-2 text-center font-mono uppercase tracking-widest text-text-primary outline-none placeholder:text-text-secondary/50 focus:border-accent-red"
                      />
                      <button
                        type="submit"
                        disabled={loading || !codeText.trim()}
                        className="rounded-sm border border-border px-4 font-semibold uppercase tracking-wider text-text-primary transition-colors hover:border-accent-red disabled:opacity-50"
                      >
                        Open
                      </button>
                    </div>
                  </form>
                </div>
              </details>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border/60 pt-3">
                {[
                  { to: '/catalog', label: 'Skin catalog' },
                  { to: '/bundle', label: 'Featured bundle' },
                  { to: '/prices', label: 'VP prices' },
                ].map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="font-display text-xs uppercase tracking-widest text-text-secondary transition-colors hover:text-accent-red"
                  >
                    {link.label} &rarr;
                  </Link>
                ))}
              </div>

              {error && (
                <p className="mt-4 text-center text-sm text-accent-red">{error}</p>
              )}
            </>
          ) : (
            <div className="animate-slide-in space-y-4">
              <div className="rounded border border-border bg-bg-primary p-4 text-sm text-text-secondary">
                <p className="mb-3 font-medium text-text-primary">After logging in on Riot's page:</p>
                <ol className="list-inside list-decimal space-y-1.5 text-xs leading-relaxed">
                  <li>You'll see a <span className="text-accent-red">"can't connect"</span> error page — this is expected</li>
                  <li>Copy the <span className="text-text-primary">entire URL</span> from the address bar</li>
                  <li>Come back to <span className="text-text-primary">this tab</span> and paste it below</li>
                </ol>
              </div>

              <form onSubmit={handleSubmitUrl} className="space-y-3">
                <textarea
                  value={pastedUrl}
                  onChange={(e) => setPastedUrl(e.target.value)}
                  placeholder="Paste the URL here (starts with http://localhost/redirect#...)"
                  rows={3}
                  className="w-full resize-none rounded border border-border bg-bg-primary px-3 py-2.5 text-xs text-text-primary placeholder-text-secondary/50 outline-none transition-colors focus:border-accent-red"
                />

                <button
                  type="submit"
                  disabled={loading || !pastedUrl.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded bg-accent-red py-3 text-sm font-bold uppercase tracking-widest text-white transition-all hover:brightness-110 hover:shadow-[0_8px_24px_-8px_rgba(255,70,85,0.6)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ fontFamily: "'Oswald', sans-serif" }}
                >
                  {loading && <Spinner />}
                  COMPLETE LOGIN
                </button>
              </form>

              {error && (
                <p className="text-center text-sm text-accent-red">{error}</p>
              )}

              <button
                type="button"
                onClick={handleBack}
                className="mx-auto block text-xs uppercase tracking-widest text-text-secondary transition-colors hover:text-text-primary"
                style={{ fontFamily: "'Oswald', sans-serif" }}
              >
                Start over
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-text-secondary/70">
          You'll log in on Riot's official page — this app never sees your password.
          <br />
          Only a temporary access token is used to fetch your store.
        </p>
        <p className="mt-4 text-center text-[10px] leading-relaxed text-text-secondary/50">
          This application is not endorsed by Riot Games and does not reflect the
          views or opinions of Riot Games or anyone officially involved in producing
          or managing Riot Games properties. Riot Games and all associated properties
          are trademarks or registered trademarks of Riot Games, Inc.
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
