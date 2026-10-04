import { useLayoutEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../context/useLanguage';
import * as api from '../api/client';
import type { Wallet } from '../types';
import WalletDisplay from './WalletDisplay';

const NAV_ITEMS = [
  { to: '/shop', label: 'Store' },
  { to: '/inventory', label: 'Inventory' },
];

// Each page mounts its own header, so remember where the highlight last sat
// and animate from there to the new tab instead of popping in.
let lastIndicator: { left: number; width: number } | null = null;

export default function AppHeader({ wallet }: { wallet?: Wallet | null }) {
  const { state, dispatch } = useAuth();
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const el = indicatorRef.current;
    if (!active || !el) return;
    // Defer one frame so the browser paints the old position first and the
    // transition has something to slide from.
    const frame = requestAnimationFrame(() => {
      lastIndicator = { left: active.offsetLeft, width: active.offsetWidth };
      el.style.width = `${lastIndicator.width}px`;
      el.style.transform = `translateX(${lastIndicator.left}px)`;
      el.style.opacity = '1';
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  async function handleLogout() {
    await api.logout().catch(() => {});
    dispatch({ type: 'LOGOUT' });
    navigate('/', { replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg-primary/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-8">
          <h1 className="font-display text-lg tracking-wider text-text-primary">
            VAL<span className="text-accent-red">SHOP</span>
          </h1>
          <nav ref={navRef} aria-label="Main" className="relative flex items-center gap-1">
            <span
              ref={indicatorRef}
              aria-hidden="true"
              className="absolute inset-y-0 left-0 overflow-hidden rounded-sm border border-accent-red/40 bg-accent-red/15 shadow-[0_0_18px_-6px_rgba(255,70,85,0.7)] transition-[transform,width,opacity] duration-500 ease-[cubic-bezier(0.65,0,0.35,1)]"
              style={{
                width: lastIndicator?.width ?? 0,
                transform: `translateX(${lastIndicator?.left ?? 0}px)`,
                opacity: lastIndicator ? 1 : 0,
              }}
            >
              <span className="absolute inset-y-0 left-0 w-0.5 bg-accent-red" />
            </span>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `font-display relative z-10 rounded-sm px-3 py-1.5 text-xs uppercase tracking-widest transition-colors duration-300 ${
                    isActive ? 'text-accent-red' : 'text-text-secondary hover:text-text-primary'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {wallet && <WalletDisplay wallet={wallet} />}
          {state.puuid && (
            <span className="hidden font-mono text-[11px] text-text-secondary/70 lg:block">
              {state.puuid.slice(0, 8)}
            </span>
          )}
          <label className="sr-only" htmlFor="language-select">Skin and bundle language</label>
          <select
            id="language-select"
            value={language}
            onChange={(event) => setLanguage(event.target.value as typeof language)}
            className="rounded-sm border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-secondary transition-colors hover:border-text-secondary focus:border-accent-red"
          >
            <option value="en-US">EN</option>
            <option value="zh-TW">繁中</option>
            <option value="zh-CN">简中</option>
          </select>
          <button
            onClick={handleLogout}
            className="font-display rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-text-secondary transition-all duration-200 hover:border-accent-red hover:text-accent-red active:scale-[0.97]"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
