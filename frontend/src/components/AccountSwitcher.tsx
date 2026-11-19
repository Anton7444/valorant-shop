import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';
import { listAccounts, removeAccount, type SavedAccount } from '../utils/savedAccounts';

function Badge({ kind, picture }: { kind: SavedAccount['kind']; picture?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (picture && !failed) {
    return (
      <img
        src={picture}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-7 w-7 shrink-0 rounded-full border border-border object-cover"
        title={kind === 'google' ? 'Google account' : 'Riot login'}
      />
    );
  }
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-bg-secondary text-[11px] font-bold text-text-primary"
      title={kind === 'google' ? 'Google account' : 'Riot login'}
    >
      {kind === 'google' ? 'G' : 'R'}
    </span>
  );
}

/** Header menu to switch between the accounts this browser has signed in to (Google and Riot). */
export default function AccountSwitcher() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<SavedAccount[]>(listAccounts);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState({ right: 0, top: 0 });
  // Names and pictures arrive a moment after sign-in; keep the button in step with the saved list.
  useEffect(() => {
    const refresh = () => setAccounts(listAccounts());
    window.addEventListener('saved-accounts-changed', refresh);
    return () => window.removeEventListener('saved-accounts-changed', refresh);
  }, []);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const current = api.getStoredToken();
  const active = accounts.find((a) => a.token === current);

  function toggle() {
    if (!open) {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setPos({ right: Math.max(8, window.innerWidth - rect.right), top: rect.bottom + 6 });
      setAccounts(listAccounts());
      setNote(null);
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  async function switchTo(account: SavedAccount) {
    if (busy || account.token === current) return;
    setBusy(true);
    setNote(null);
    const previous = current;
    api.storeToken(account.token);
    try {
      const res = await api.checkSession();
      if (!res.valid) throw new Error('expired');
      // Every page holds the previous account's data, so start over with the new one.
      window.location.reload();
    } catch (err) {
      if (previous) api.storeToken(previous);
      else api.clearToken();
      if (err instanceof Error && err.message === 'expired') {
        removeAccount(account.token);
        setAccounts(listAccounts());
        setNote(`${account.label} has signed out. Add it again to switch back.`);
      } else {
        setNote('Could not switch right now. Try again.');
      }
      setBusy(false);
    }
  }

  function forget(account: SavedAccount) {
    removeAccount(account.token);
    void api.logoutToken(account.token).catch(() => {});
    setAccounts(listAccounts());
  }

  const label = active?.label ?? (state.account?.name || state.account?.email || state.puuid?.slice(0, 8) || 'Account');

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        title={`Switch account (${label})`}
        aria-label={`Switch account, signed in as ${label}`}
        className="font-display inline-flex items-center gap-2 rounded-sm border border-border px-2.5 py-1.5 text-xs uppercase tracking-widest text-text-secondary transition-all duration-200 hover:border-accent-red hover:text-accent-red active:scale-[0.97]"
      >
        <Badge kind={active?.kind ?? (state.account ? 'google' : 'riot')} picture={state.account?.picture ?? active?.picture} />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{ position: 'fixed', right: pos.right, top: pos.top }}
            className="z-50 w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-bg-card p-1.5 shadow-xl"
          >
            <ul className="max-h-72 overflow-y-auto">
              {accounts.length === 0 && <li className="px-3 py-2 text-xs text-text-secondary">Only this account is saved so far.</li>}
              {accounts.map((a) => {
                const isCurrent = a.token === current;
                return (
                  <li key={a.token} className="group flex items-center gap-1">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={isCurrent}
                      disabled={busy}
                      onClick={() => void switchTo(a)}
                      className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-sm px-2.5 py-2 text-left transition-colors hover:bg-white/5 ${isCurrent ? 'bg-accent-red/10' : ''}`}
                    >
                      <Badge kind={a.kind} picture={a.picture} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-text-primary">{a.label}</span>
                        <span className="block truncate text-[11px] text-text-secondary">
                          {a.detail}
                          {a.kind === 'riot' ? ' · short session' : ''}
                        </span>
                      </span>
                      {isCurrent && <span className="text-[11px] font-semibold text-accent-red">Active</span>}
                    </button>
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => forget(a)}
                        aria-label={`Remove ${a.label}`}
                        title="Remove from this browser"
                        className="rounded-sm p-2 text-text-secondary/60 transition-colors hover:text-accent-red"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {note && <p className="px-3 py-2 text-xs text-accent-red">{note}</p>}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('/?add=1');
              }}
              className="mt-1 w-full rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest text-text-secondary transition-colors hover:border-accent-red hover:text-accent-red"
            >
              Add account
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
