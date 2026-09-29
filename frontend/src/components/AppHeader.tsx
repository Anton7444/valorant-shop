import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../context/useLanguage';
import * as api from '../api/client';
import type { Wallet } from '../types';
import WalletDisplay from './WalletDisplay';

const NAV_ITEMS = [
  { to: '/shop', label: 'Store' },
  { to: '/inventory', label: 'Inventory' },
];

export default function AppHeader({ wallet }: { wallet?: Wallet | null }) {
  const { state, dispatch } = useAuth();
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();

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
          <nav aria-label="Main" className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `font-display rounded-sm px-3 py-1.5 text-xs uppercase tracking-widest transition-colors duration-200 ${
                    isActive
                      ? 'bg-accent-red/10 text-accent-red'
                      : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
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
            className="rounded-sm border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-secondary transition-colors hover:border-text-secondary"
          >
            <option value="en-US">EN</option>
            <option value="zh-TW">繁中</option>
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
