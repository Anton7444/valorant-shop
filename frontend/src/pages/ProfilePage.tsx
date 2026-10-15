import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';
import type { MatchSummary, ProfileResponse } from '../types';
import { useLanguage } from '../context/useLanguage';
import { localizedName } from '../context/languageNames';
import AppHeader from '../components/AppHeader';
import { staggerStyle, trackPointer } from '../utils/spotlight';

const QUEUE_LABELS: Record<string, string> = {
  competitive: 'Competitive',
  unrated: 'Unrated',
  spikerush: 'Spike Rush',
  deathmatch: 'Deathmatch',
  ggteam: 'Escalation',
  onefa: 'Replication',
  swiftplay: 'Swiftplay',
  hurm: 'Team Deathmatch',
  premier: 'Premier',
  snowball: 'Snowball Fight',
  newmap: 'New Map',
  custom: 'Custom',
};

function queueLabel(queue: string): string {
  return QUEUE_LABELS[queue] ?? (queue ? queue.charAt(0).toUpperCase() + queue.slice(1) : 'Unknown');
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <h2 className="font-display text-xl uppercase tracking-[0.18em] text-text-primary">{children}</h2>
      {hint && <span className="text-xs text-text-secondary">{hint}</span>}
    </div>
  );
}

function Unavailable({ what }: { what: string }) {
  return <p className="py-6 text-sm text-text-secondary">{what} couldn&apos;t be loaded right now.</p>;
}

function CurrencyTile({ label, value, accent }: { label: string; value: number | undefined; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-widest text-text-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: accent ?? 'var(--color-text-primary)' }}>
        {(value ?? 0).toLocaleString()}
      </div>
    </div>
  );
}

function MatchRow({ match, index }: { match: MatchSummary; index: number }) {
  const { localizedNames } = useLanguage();
  const result = match.won === true ? 'Win' : match.won === false ? 'Loss' : 'Draw';
  const color =
    match.won === true ? 'var(--color-accent-teal)' : match.won === false ? 'var(--color-accent-red)' : 'var(--color-text-secondary)';
  const agent = match.agent_uuid ? localizedName(match.agent_uuid, match.agent_name, localizedNames) : match.agent_name;
  const mapName = match.map_uuid ? localizedName(match.map_uuid, match.map_name, localizedNames) : match.map_name;
  const minutes = Math.round(match.length_secs / 60);
  const kd = match.deaths === 0 ? match.kills.toFixed(1) : (match.kills / match.deaths).toFixed(2);

  return (
    <li
      className="card-motion card-spotlight flex items-center gap-4 overflow-hidden rounded-lg border border-border bg-bg-card p-3"
      onPointerMove={trackPointer}
      style={staggerStyle(index)}
    >
      <div className="h-10 w-0.5 shrink-0 self-stretch rounded-full" style={{ backgroundColor: color }} />
      {match.agent_icon ? (
        <img src={match.agent_icon} alt={agent} loading="lazy" className="h-12 w-12 shrink-0 rounded-sm bg-bg-secondary object-cover" />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-sm bg-bg-secondary" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm uppercase tracking-widest" style={{ color }}>
            {result}
          </span>
          {match.rounds_won !== null && match.rounds_lost !== null && (
            <span className="text-sm font-semibold text-text-primary">
              {match.rounds_won} : {match.rounds_lost}
            </span>
          )}
        </div>
        <div className="truncate text-xs text-text-secondary">
          {mapName} · {agent} · {queueLabel(match.queue)}
        </div>
      </div>
      <div className="hidden text-right text-xs text-text-secondary sm:block">
        <div>{new Date(match.started_at).toLocaleString()}</div>
        <div>{minutes} min</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold text-text-primary">
          {match.kills} / {match.deaths} / {match.assists}
        </div>
        <div className="text-[11px] text-text-secondary">K/D {kd}</div>
      </div>
    </li>
  );
}

export default function ProfilePage() {
  const { dispatch } = useAuth();
  const navigate = useNavigate();
  const { localizedNames } = useLanguage();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getProfile()
      .then(setProfile)
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load profile';
        if (message.includes('401') || message.includes('Not authenticated') || message.includes('Session expired')) {
          dispatch({ type: 'LOGOUT' });
          navigate('/', { replace: true });
          return;
        }
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [dispatch, navigate]);

  const ownedCount = profile?.agents.filter((a) => a.owned).length ?? 0;
  const unavailable = new Set(profile?.unavailable ?? []);

  return (
    <div className="min-h-dvh">
      <AppHeader wallet={profile?.wallet} />

      <main id="main" className="mx-auto max-w-6xl space-y-12 px-4 py-10">
        {loading ? (
          <p className="py-20 text-center text-text-secondary">Loading...</p>
        ) : error || !profile ? (
          <p className="py-20 text-center text-accent-red">{error ?? 'Failed to load profile'}</p>
        ) : (
          <>
            <section>
              <div className="mb-6">
                <h1 className="font-display text-3xl tracking-wider text-text-primary">
                  {profile.game_name ? (
                    <>
                      {profile.game_name}
                      {profile.tag_line && <span className="text-text-secondary">#{profile.tag_line}</span>}
                    </>
                  ) : (
                    'Player'
                  )}
                </h1>
                <p className="mt-1 text-xs text-text-secondary">
                  {profile.level !== null ? `Level ${profile.level} · ` : ''}
                  <span className="font-mono">{profile.puuid.slice(0, 8)}</span>
                </p>
              </div>
              {unavailable.has('wallet') || !profile.wallet ? (
                <Unavailable what="Your balances" />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <CurrencyTile label="Valorant Points" value={profile.wallet.valorant_points} />
                  <CurrencyTile label="Radianite" value={profile.wallet.radianite_points} accent="var(--color-accent-teal)" />
                  <CurrencyTile label="Kingdom Credits" value={profile.wallet.kingdom_credits} accent="#e8c15a" />
                </div>
              )}
            </section>

            <section>
              <SectionTitle hint={profile.agents.length ? `${ownedCount} / ${profile.agents.length} unlocked` : undefined}>
                Agents
              </SectionTitle>
              {unavailable.has('agents') ? (
                <Unavailable what="Your agent roster" />
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9">
                  {profile.agents.map((agent) => {
                    const name = localizedName(agent.uuid, agent.name, localizedNames);
                    return (
                      <div
                        key={agent.uuid}
                        title={agent.owned ? name : `${name} (locked)`}
                        className={`overflow-hidden rounded-lg border border-border bg-bg-card text-center transition-opacity ${
                          agent.owned ? '' : 'opacity-35 grayscale'
                        }`}
                      >
                        <img src={agent.icon} alt={name} loading="lazy" className="aspect-square w-full object-cover" />
                        <div className="truncate px-1 py-1.5 text-[11px] text-text-primary">{name}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <SectionTitle hint="Last 10 matches">Match history</SectionTitle>
              {unavailable.has('matches') ? (
                <Unavailable what="Your match history" />
              ) : profile.matches.length === 0 ? (
                <p className="py-6 text-sm text-text-secondary">No recent matches found.</p>
              ) : (
                <ul className="space-y-3">
                  {profile.matches.map((match, index) => (
                    <MatchRow key={match.match_id} match={match} index={index} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
