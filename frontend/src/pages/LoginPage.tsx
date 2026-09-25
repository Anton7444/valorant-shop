import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';

type Stage = 'start' | 'paste';

export default function LoginPage() {
  const { state, dispatch } = useAuth();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>(
    () => (sessionStorage.getItem('login_stage') === 'paste' ? 'paste' : 'start')
  );
  const [pastedUrl, setPastedUrl] = useState('');
  const [pastedCookies, setPastedCookies] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cookieResult, setCookieResult] = useState<'valid' | 'invalid' | null>(null);

  if (state.status === 'authenticated') {
    return <Navigate to="/shop" replace />;
  }

  async function handleOpenLogin() {
    setLoading(true);
    setError(null);

    try {
      const { auth_url } = await api.getAuthUrl();
      window.open(auth_url, '_blank', 'noopener');
      sessionStorage.setItem('login_stage', 'paste');
      setStage('paste');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start login');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!pastedUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await api.submitToken(pastedUrl.trim(), pastedCookies.trim());

      if (res.status === 'success' && res.puuid && res.session_token) {
        sessionStorage.removeItem('login_stage');
        api.storeToken(res.session_token);
        dispatch({ type: 'LOGIN_SUCCESS', puuid: res.puuid });

        if (res.cookies_valid === true) {
          setCookieResult('valid');
          setTimeout(() => navigate('/shop'), 1400);
        } else if (res.cookies_valid === false) {
          setCookieResult('invalid');
          setLoading(false);
          // Let them read the warning instead of yanking them away immediately.
          setTimeout(() => navigate('/shop'), 2200);
        } else {
          navigate('/shop');
        }
      } else {
        setError(res.error ?? 'Authentication failed');
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authenticate');
      setLoading(false);
    }
  }

  function handleBack() {
    sessionStorage.removeItem('login_stage');
    setStage('start');
    setPastedUrl('');
    setPastedCookies('');
    setError(null);
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-bg-primary px-4">
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
        <div className="rounded-lg border border-border bg-bg-secondary p-8 shadow-2xl">
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
                className="flex w-full items-center justify-center gap-2 rounded bg-accent-red py-3 text-sm font-bold uppercase tracking-widest text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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

                <details className="group rounded border border-border bg-bg-primary open:pb-3">
                  <summary className="cursor-pointer select-none list-none px-3 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary">
                    <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">▸</span>
                    Stay signed in for 2 weeks instead of 3 hours <span className="text-text-secondary/50">(optional)</span>
                  </summary>
                  <div className="space-y-2 px-3 pt-1 text-xs leading-relaxed text-text-secondary">
                    <p>
                      By default you'll need to repeat this whole process every few hours.
                      To skip that, also paste your Riot session cookies — completely optional,
                      you can always add this later.
                    </p>
                    <ol className="list-inside list-decimal space-y-1">
                      <li>On the same Riot tab: devtools (F12) → <span className="text-text-primary">Network</span> tab, then log in</li>
                      <li>Find the row named <span className="text-text-primary">login</span> (Type: fetch, around 200 status)</li>
                      <li>Right-click it → <span className="text-text-primary">Copy → Copy as cURL</span></li>
                      <li>Paste the whole thing below — it's parsed automatically, no need to trim it</li>
                    </ol>
                    <textarea
                      value={pastedCookies}
                      onChange={(e) => setPastedCookies(e.target.value)}
                      placeholder="Paste the copied cURL command here (leave blank to skip)"
                      rows={3}
                      className="w-full resize-none rounded border border-border bg-bg-secondary px-3 py-2.5 text-xs text-text-primary placeholder-text-secondary/50 outline-none transition-colors focus:border-accent-red"
                    />
                  </div>
                </details>

                <button
                  type="submit"
                  disabled={loading || !pastedUrl.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded bg-accent-red py-3 text-sm font-bold uppercase tracking-widest text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ fontFamily: "'Oswald', sans-serif" }}
                >
                  {loading && <Spinner />}
                  COMPLETE LOGIN
                </button>
              </form>

              {error && (
                <p className="text-center text-sm text-accent-red">{error}</p>
              )}

              {cookieResult === 'valid' && (
                <p className="text-center text-sm text-accent-teal">
                  ✓ Persistent login confirmed — you won't need to log in again for ~2 weeks.
                </p>
              )}
              {cookieResult === 'invalid' && (
                <p className="text-center text-sm text-accent-red">
                  You're logged in, but those cookies didn't work — you'll still need to log
                  in again in a few hours. Try re-copying them, or skip this next time.
                </p>
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
