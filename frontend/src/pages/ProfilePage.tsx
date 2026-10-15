import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';
import type { MatchSummary, PlayerRow, ProfileResponse } from '../types';
import { useLanguage } from '../context/useLanguage';
import { localizedName } from '../context/languageNames';
import AppHeader from '../components/AppHeader';
import ScrollFade from '../components/ScrollFade';
import { useRovingArrows } from '../hooks/useRovingArrows';
import { ProfileSkeleton } from '../components/Skeletons';
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
  abilitydraftarena: 'Ability Draft Arena',
  snowball: 'Snowball Fight',
  newmap: 'New Map',
  custom: 'Custom',
};

// Custom games come back with an empty queue id.
const normalizeQueue = (queue: string) => queue || 'custom';

function queueLabel(queue: string): string {
  const q = normalizeQueue(queue);
  return QUEUE_LABELS[q] ?? q.charAt(0).toUpperCase() + q.slice(1);
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

const ROLE_ORDER = ['Duelist', 'Initiator', 'Controller', 'Sentinel'];

const ROLE_NAMES: Record<string, Record<string, string>> = {
  'zh-TW': { Duelist: '決鬥者', Initiator: '先鋒', Controller: '控場者', Sentinel: '哨衛' },
  'zh-CN': { Duelist: '决斗者', Initiator: '先锋', Controller: '控场者', Sentinel: '哨卫' },
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-sm border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
        active
          ? 'border-accent-red bg-accent-red/10 text-text-primary'
          : 'border-border bg-bg-secondary text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

const COLUMNS: { key: string; label: string; render: (p: PlayerRow) => React.ReactNode }[] = [
  { key: 'acs', label: 'ACS', render: (p) => p.acs },
  { key: 'k', label: 'K', render: (p) => p.kills },
  { key: 'd', label: 'D', render: (p) => p.deaths },
  { key: 'a', label: 'A', render: (p) => p.assists },
  {
    key: 'pm',
    label: '+/-',
    render: (p) => (
      <span className={p.plus_minus > 0 ? 'text-accent-teal' : p.plus_minus < 0 ? 'text-accent-red' : ''}>
        {p.plus_minus > 0 ? `+${p.plus_minus}` : p.plus_minus}
      </span>
    ),
  },
  { key: 'kd', label: 'K/D', render: (p) => p.kd.toFixed(1) },
  {
    key: 'dda',
    label: 'DDΔ',
    render: (p) => (
      <span className={p.dda > 0 ? 'text-accent-teal' : p.dda < 0 ? 'text-accent-red' : ''}>
        {p.dda > 0 ? `+${p.dda}` : p.dda}
      </span>
    ),
  },
  { key: 'adr', label: 'ADR', render: (p) => p.adr.toFixed(1) },
  { key: 'hs', label: 'HS%', render: (p) => `${p.hs_pct}%` },
  { key: 'fk', label: 'FK', render: (p) => p.first_kills },
  { key: 'fd', label: 'FD', render: (p) => p.first_deaths },
];

// "TEAM_1" -> "Team 1"; names like "Red" / "Blue" are kept.
function teamLabel(teamId: string): string {
  const numbered = /^team_?(\d+)$/i.exec(teamId);
  return numbered ? `Team ${numbered[1]}` : teamId;
}

function Scoreboard({ match }: { match: MatchSummary }) {
  const { localizedNames } = useLanguage();
  // Group players by team (a mode without teams is one group), best team first:
  // winners, then rounds won, then the team's combined score.
  const groups = match.teams.length
    ? match.teams
        .map((team) => {
          const players = match.players.filter((p) => p.team_id === team.team_id);
          return { team, players, total: players.reduce((sum, p) => sum + p.score, 0) };
        })
        .sort(
          (a, b) =>
            Number(b.team.won === true) - Number(a.team.won === true) ||
            (b.team.rounds_won ?? 0) - (a.team.rounds_won ?? 0) ||
            b.total - a.total,
        )
    : [{ team: null, players: match.players, total: 0 }];

  const noRounds = match.teams.every((t) => !t.rounds_won);

  return (
    <ScrollFade className="border-t border-border bg-bg-primary/40">
      {groups.map(({ team, players }, groupIndex) => {
        const color =
          team?.won === true ? 'var(--color-accent-teal)' : team?.won === false ? 'var(--color-accent-red)' : 'var(--color-text-secondary)';
        return (
          <table key={team?.team_id ?? groupIndex} className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-text-secondary" style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                <th className="px-3 py-2 text-left font-semibold" style={{ color }}>
                  {team
                    ? `${groups.length > 2 ? `#${groupIndex + 1} · ` : ''}${teamLabel(team.team_id)}${team.rounds_won !== null && !noRounds ? ` · ${team.rounds_won}` : ''}`
                    : 'Players'}
                </th>
                <th className="px-2 py-2 text-left font-semibold">Rank</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-2 py-2 text-right font-semibold">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const agent = player.agent_uuid ? localizedName(player.agent_uuid, player.agent_name, localizedNames) : player.agent_name;
                return (
                  <tr key={player.puuid} className={player.is_me ? 'bg-white/5' : ''}>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className="relative shrink-0">
                          {player.agent_icon ? (
                            <img src={player.agent_icon} alt={agent} loading="lazy" className="h-9 w-9 rounded-sm bg-bg-secondary object-cover" />
                          ) : (
                            <div className="h-9 w-9 rounded-sm bg-bg-secondary" />
                          )}
                          {player.level !== null && (
                            <span className="absolute -bottom-1 left-0 rounded-sm bg-black/70 px-1 text-[9px] leading-tight text-white">
                              {player.level}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-text-primary">
                            {player.game_name ?? <span className="text-text-secondary">Hidden</span>}
                            {player.tag_line && <span className="ml-1 text-xs text-text-secondary">#{player.tag_line}</span>}
                          </div>
                          {player.agent_uuid && <div className="truncate text-[11px] text-text-secondary">{agent}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-xs text-text-secondary">{player.rank}</td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="px-2 py-1.5 text-right font-semibold tabular-nums text-text-primary">
                        {c.render(player)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })}
    </ScrollFade>
  );
}

function MatchRow({ match, index }: { match: MatchSummary; index: number }) {
  const { localizedNames } = useLanguage();
  // Modes without round wins (e.g. Ability Draft Arena) report 0:0 for everyone.
  const noRounds = match.rounds_won === 0 && match.rounds_lost === 0;
  const result = noRounds ? 'Match' : match.won === true ? 'Win' : match.won === false ? 'Loss' : 'Draw';
  const color =
    match.won === true ? 'var(--color-accent-teal)' : match.won === false ? 'var(--color-accent-red)' : 'var(--color-text-secondary)';
  const agent = match.agent_uuid ? localizedName(match.agent_uuid, match.agent_name, localizedNames) : match.agent_name;
  const mapName = match.map_uuid ? localizedName(match.map_uuid, match.map_name, localizedNames) : match.map_name;
  const minutes = Math.round(match.length_secs / 60);
  const kd = match.deaths === 0 ? match.kills.toFixed(1) : (match.kills / match.deaths).toFixed(2);
  const [open, setOpen] = useState(false);

  return (
    <li
      className="card-motion card-spotlight overflow-hidden rounded-lg border border-border bg-bg-card"
      onPointerMove={trackPointer}
      style={staggerStyle(index)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="no-press flex w-full items-center gap-4 p-3 text-left"
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
            {!noRounds && match.rounds_won !== null && match.rounds_lost !== null && (
              <span className="text-sm font-semibold text-text-primary">
                {match.rounds_won} : {match.rounds_lost}
              </span>
            )}
          </div>
          <div className="truncate text-xs text-text-secondary">
            {[mapName, match.agent_uuid ? agent : null, queueLabel(match.queue)].filter(Boolean).join(' · ')}
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
        <svg
          className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && match.players.length > 0 && <Scoreboard match={match} />}
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

  // Older matches fetched with "Load more" (the first 20 come with the profile).
  const [moreMatches, setMoreMatches] = useState<MatchSummary[]>([]);
  const [nextStart, setNextStart] = useState(20);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const canLoadMore = hasMore ?? profile?.has_more_matches ?? false;
  const allMatches = useMemo(() => [...(profile?.matches ?? []), ...moreMatches], [profile, moreMatches]);

  function loadMore() {
    setLoadingMore(true);
    setMoreError(null);
    api
      .getMatches(nextStart)
      .then((res) => {
        setMoreMatches((cur) => {
          const seen = new Set(cur.map((m) => m.match_id).concat((profile?.matches ?? []).map((m) => m.match_id)));
          return [...cur, ...res.matches.filter((m) => !seen.has(m.match_id))];
        });
        setNextStart((n) => n + 10);
        setHasMore(res.has_more);
      })
      .catch((err) => setMoreError(err instanceof Error ? err.message : 'Failed to load more matches'))
      .finally(() => setLoadingMore(false));
  }

  const roleRowRef = useRovingArrows<HTMLDivElement>();
  const modeRowRef = useRovingArrows<HTMLDivElement>();
  const [queueFilter, setQueueFilter] = useState<Set<string>>(new Set());
  // Game modes that actually appear in the loaded matches, most played first.
  const queues = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of allMatches) {
      const q = normalizeQueue(m.queue);
      counts.set(q, (counts.get(q) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [allMatches]);
  const visibleMatches = allMatches.filter(
    (m) => queueFilter.size === 0 || queueFilter.has(normalizeQueue(m.queue)),
  );
  const [roleFilter, setRoleFilter] = useState<Set<string>>(new Set());
  const { language } = useLanguage();
  const roles = useMemo(() => {
    const present = new Set((profile?.agents ?? []).map((a) => a.role).filter(Boolean));
    return [...ROLE_ORDER.filter((r) => present.has(r)), ...[...present].filter((r) => !ROLE_ORDER.includes(r))];
  }, [profile]);
  const visibleAgents = (profile?.agents ?? []).filter((a) => roleFilter.size === 0 || roleFilter.has(a.role));
  const roleLabel = (role: string) => ROLE_NAMES[language]?.[role] ?? role;
  const ownedCount = profile?.agents.filter((a) => a.owned).length ?? 0;
  const unavailable = new Set(profile?.unavailable ?? []);

  return (
    <div className="min-h-dvh">
      <AppHeader wallet={profile?.wallet} />

      <main id="main" className="mx-auto max-w-6xl space-y-12 px-4 py-10">
        {loading ? (
          <ProfileSkeleton />
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
                <>
                <div ref={roleRowRef} className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[11px] uppercase tracking-widest text-text-secondary">Role</span>
                  {roles.map((role) => (
                    <Chip
                      key={role}
                      active={roleFilter.has(role)}
                      onClick={() =>
                        setRoleFilter((cur) => {
                          const next = new Set(cur);
                          if (!next.delete(role)) next.add(role);
                          return next;
                        })
                      }
                    >
                      {roleLabel(role)}
                    </Chip>
                  ))}
                  {roleFilter.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setRoleFilter(new Set())}
                      className="ml-2 text-xs text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9">
                  {visibleAgents.map((agent) => {
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
                </>
              )}
            </section>

            <section>
              <SectionTitle hint="Click a match for the full scoreboard">Match history</SectionTitle>
              {unavailable.has('matches') ? (
                <Unavailable what="Your match history" />
              ) : profile.matches.length === 0 ? (
                <p className="py-6 text-sm text-text-secondary">No recent matches found.</p>
              ) : (
                <>
                  <div ref={modeRowRef} className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-[11px] uppercase tracking-widest text-text-secondary">Mode</span>
                    {queues.map(([queue, count]) => (
                      <Chip
                        key={queue}
                        active={queueFilter.has(queue)}
                        onClick={() =>
                          setQueueFilter((cur) => {
                            const next = new Set(cur);
                            if (!next.delete(queue)) next.add(queue);
                            return next;
                          })
                        }
                      >
                        {queueLabel(queue)} <span className="ml-1 opacity-60">{count}</span>
                      </Chip>
                    ))}
                    {queueFilter.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setQueueFilter(new Set())}
                        className="ml-2 text-xs text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <ul className="space-y-3">
                    {visibleMatches.map((match, index) => (
                      <MatchRow key={match.match_id} match={match} index={index} />
                    ))}
                  </ul>
                  {canLoadMore && (
                    <div className="mt-6 text-center">
                      <button
                        type="button"
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="rounded-sm border border-border bg-bg-secondary px-5 py-2 text-xs font-semibold uppercase tracking-widest text-text-secondary transition-colors hover:border-accent-red hover:text-text-primary disabled:opacity-60"
                      >
                        {loadingMore ? 'Loading...' : 'Load more matches'}
                      </button>
                      {moreError && <p className="mt-2 text-xs text-accent-red">{moreError}</p>}
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
