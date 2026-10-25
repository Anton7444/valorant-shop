import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../context/useLanguage';
import * as api from '../api/client';
import type { BattlePassResponse, PassLevel } from '../types';
import AppHeader from '../components/AppHeader';
import RollingNumber from '../components/RollingNumber';
import { localizedName } from '../context/languageNames';
import { staggerStyle } from '../utils/spotlight';

const KIND_LABELS: Record<string, string> = {
  skin: 'Skin',
  buddy: 'Gun buddy',
  spray: 'Spray',
  card: 'Player card',
  title: 'Title',
  currency: 'Currency',
  agent: 'Agent',
  other: 'Reward',
};

function daysLeft(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return 'Season ended';
  const days = Math.floor(ms / 86_400_000);
  return days >= 1 ? `${days} day${days === 1 ? '' : 's'} left` : 'Ends today';
}

export default function BattlePassPage() {
  const { dispatch } = useAuth();
  const navigate = useNavigate();
  const [pass, setPass] = useState<BattlePassResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPass(await api.getBattlePass());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load the battle pass';
      if (message.includes('401') || message.includes('Not authenticated') || message.includes('Session expired')) {
        dispatch({ type: 'LOGOUT' });
        navigate('/', { replace: true });
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [dispatch, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 py-10">
        {loading ? (
          <div className="animate-pulse space-y-6">
            <div className="h-44 rounded-lg border border-border bg-bg-card" />
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
              {Array.from({ length: 16 }, (_, i) => (
                <div key={i} className="h-36 rounded-lg border border-border bg-bg-card" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <p className="text-accent-red">{error}</p>
            <button
              onClick={load}
              className="rounded bg-accent-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-110"
            >
              Retry
            </button>
          </div>
        ) : pass ? (
          <PassView pass={pass} />
        ) : null}
      </main>
    </div>
  );
}

function PassView({ pass }: { pass: BattlePassResponse }) {
  const done = pass.xp_for_next === 0;
  const percentNext = done ? 100 : Math.min(100, Math.round((pass.xp_into_level / pass.xp_for_next) * 100));
  const percentAll = pass.max_level ? Math.round((pass.level / pass.max_level) * 100) : 0;
  const left = daysLeft(pass.ends_at);
  return (
    <>
      <section className="rise-in mb-10 rounded-lg border border-border bg-bg-card p-6" style={staggerStyle(0)}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-text-secondary">Battle pass</p>
            <h2 className="font-display mt-1 text-2xl uppercase tracking-[0.14em] text-text-primary">{pass.name}</h2>
            {left && <p className="mt-1 text-xs text-text-secondary">{left}</p>}
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-widest text-text-secondary">Tier</p>
            <p className="text-4xl font-semibold text-text-primary">
              <RollingNumber value={pass.level} />
              <span className="text-lg text-text-secondary"> / {pass.max_level}</span>
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-1.5 flex items-baseline justify-between text-xs text-text-secondary">
            <span>{done ? 'Every tier reached' : `Tier ${pass.level + 1}`}</span>
            <span>
              {done ? `${pass.total_xp.toLocaleString()} XP` : `${pass.xp_into_level.toLocaleString()} / ${pass.xp_for_next.toLocaleString()} XP`}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-bg-secondary" role="progressbar" aria-valuenow={percentNext} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to the next tier">
            <div className="h-full rounded-full bg-accent-red transition-[width] duration-700 ease-out" style={{ width: `${percentNext}%` }} />
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Stat label="Total XP" value={pass.total_xp.toLocaleString()} />
          <Stat label="XP left to finish" value={pass.xp_remaining.toLocaleString()} />
          <Stat label="Pass complete" value={`${percentAll}%`} />
        </dl>
      </section>

      <ul className="mb-8 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
        {pass.levels.map((level) => (
          <LevelTile key={level.level} level={level} isNext={level.level === pass.level + 1} />
        ))}
      </ul>

      <p className="text-xs leading-relaxed text-text-secondary">
        Tiers and rewards are the premium track; whether you own the premium pass, and the free-track rewards, are not
        shown. The tier is worked out from your total XP and the pass's XP table.
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-widest text-text-secondary">{label}</dt>
      <dd className="mt-0.5 font-semibold text-text-primary">{value}</dd>
    </div>
  );
}

function LevelTile({ level, isNext }: { level: PassLevel; isNext: boolean }) {
  const { localizedNames } = useLanguage();
  const reward = level.reward;
  const name = reward ? localizedName(reward.uuid, reward.name, localizedNames) : '';

  return (
    <li
      className={`rise-in relative flex flex-col overflow-hidden rounded-lg border bg-bg-card ${
        isNext ? 'border-accent-red' : level.reached ? 'border-accent-teal/50' : 'border-border'
      }`}
      style={staggerStyle(Math.min(level.level, 24))}
      title={reward ? `${name}${reward.amount > 1 ? ` ×${reward.amount}` : ''}` : undefined}
    >
      <div className="flex items-center justify-between px-2 pt-1.5 text-[10px] font-semibold uppercase tracking-wider">
        <span className={isNext ? 'text-accent-red' : level.reached ? 'text-accent-teal' : 'text-text-secondary'}>
          {level.level}
        </span>
        {level.epilogue && <span className="ml-auto mr-1 text-[9px] font-normal text-text-secondary/70">Epilogue</span>}
        {level.reached && (
          <svg className="h-3 w-3 text-accent-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Reached">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </div>
      <div className={`flex h-20 items-center justify-center p-2 ${level.reached ? '' : 'opacity-60'}`}>
        {reward?.icon ? (
          <img src={reward.icon} alt={name} loading="lazy" className="max-h-full max-w-full object-contain" />
        ) : reward ? (
          <span className="line-clamp-3 text-center font-display text-xs uppercase tracking-wider text-text-primary">{name}</span>
        ) : null}
      </div>
      <div className="mt-auto px-2 pb-2">
        <p className="line-clamp-1 text-[11px] text-text-primary">
          {name}
          {reward && reward.amount > 1 ? ` ×${reward.amount.toLocaleString()}` : ''}
        </p>
        <p className="text-[10px] uppercase tracking-wider text-text-secondary">{reward ? KIND_LABELS[reward.kind] : ''}</p>
      </div>
    </li>
  );
}
