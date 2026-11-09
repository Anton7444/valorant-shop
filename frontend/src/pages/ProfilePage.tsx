import RollingNumber from '../components/RollingNumber';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';
import type { MatchSummary, PlayerRow, ProfileResponse } from '../types';
import { useWeapons } from '../hooks/useWeapons';
import { useRankIcons } from '../hooks/useRankIcons';
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

function SectionTitle({ children, hint, index = 4 }: { children: React.ReactNode; hint?: string; index?: number }) {
  return (
    <div className="rise-in mb-4 flex items-baseline gap-3" style={staggerStyle(index)}>
      <h2 className="font-display text-xl uppercase tracking-[0.18em] text-text-primary">{children}</h2>
      {hint && <span className="text-xs text-text-secondary">{hint}</span>}
    </div>
  );
}

function Unavailable({ what }: { what: string }) {
  return <p className="py-6 text-sm text-text-secondary">{what} couldn&apos;t be loaded right now.</p>;
}

function CurrencyTile({
  label,
  value,
  accent,
  index,
}: {
  label: string;
  value: number | undefined;
  accent?: string;
  index: number;
}) {
  return (
    <div className="rise-in rounded-lg border border-border bg-bg-card px-4 py-3" style={staggerStyle(index)}>
      <div className="text-[11px] uppercase tracking-widest text-text-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: accent ?? 'var(--color-text-primary)' }}>
        <RollingNumber value={value ?? 0} />
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
  const rankIcons = useRankIcons();
  // Group players by team (a mode without teams is one group), best team first:
  // winners, then rounds won, then the team's combined score.
  const grouped = match.teams.length
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

  // Free-for-all modes (e.g. Ability Draft Arena) make every player their own "team" with a
  // player-id as its name; show one ranked list instead of a header per player.
  const freeForAll = grouped.length > 2 && grouped.every((g) => g.players.length <= 1);
  const groups = freeForAll
    ? [{ team: null, players: grouped.flatMap((g) => g.players), total: 0 }]
    : grouped;
  // In a free-for-all every player is their own team: show their placement, green for the winner.
  const placements = new Map<string, { place: number; won: boolean | null }>();
  if (freeForAll) {
    grouped.forEach((g, i) => g.players.forEach((p) => placements.set(p.puuid, { place: i + 1, won: g.team?.won ?? null })));
  }

  const noRounds = match.teams.every((t) => !t.rounds_won);

  return (
    <ScrollFade className="border-t border-border bg-bg-primary/40">
      {groups.map(({ team, players }, groupIndex) => {
        const color =
          team?.won === true ? 'var(--color-accent-teal)' : team?.won === false ? 'var(--color-accent-red)' : 'var(--color-text-secondary)';
        return (
          <table key={team?.team_id ?? groupIndex} className="w-full min-w-[820px] table-fixed border-collapse text-sm">
            {/* Fixed widths keep both teams' columns lined up */}
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[7%]" />
              {COLUMNS.map((c) => <col key={c.key} />)}
            </colgroup>
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
                        {placements.has(player.puuid) && (
                          <span
                            className="w-7 shrink-0 text-right text-xs font-bold"
                            style={{
                              color:
                                placements.get(player.puuid)!.won === true
                                  ? 'var(--color-accent-teal)'
                                  : placements.get(player.puuid)!.won === false
                                    ? 'var(--color-accent-red)'
                                    : 'var(--color-text-secondary)',
                            }}
                          >
                            #{placements.get(player.puuid)!.place}
                          </span>
                        )}
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
                    <td className="whitespace-nowrap px-2 py-1.5 text-xs text-text-secondary">
                      {rankIcons[player.rank.toLowerCase()] ? (
                        <img src={rankIcons[player.rank.toLowerCase()]} alt={player.rank} title={player.rank} className="h-8 w-8 object-contain" />
                      ) : (
                        player.rank
                      )}
                    </td>
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
  // The scoreboard is built the first time a match is opened, then kept so it can animate shut.
  const [built, setBuilt] = useState(false);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    if (built) {
      setOpen(true);
      return;
    }
    // Mount it collapsed first, then open on a later frame so the height can animate.
    setBuilt(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
  }

  return (
    <li
      className="card-motion card-spotlight overflow-hidden rounded-lg border border-border bg-bg-card"
      onPointerMove={trackPointer}
      style={staggerStyle(index < 20 ? 6 + index : 0)}
    >
      <button
        type="button"
        onClick={toggle}
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
      {built && match.players.length > 0 && (
        // 0fr -> 1fr animates the height without measuring it
        <div
          inert={!open}
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <Scoreboard match={match} />
          </div>
        </div>
      )}
    </li>
  );
}

/* Body figure with one zone lit up (head, body or legs) in place of a text label */
const BODY_ARM_TORSO = 'M30 15 L25 15.5 C20 17 14 19 10.5 22 C7.5 24.5 6.5 29 6 35 C5.5 41 6.5 46 6 51 L4.5 60 C4 63.5 8.5 64 9.5 60.5 L12 52 C13 47 12.5 42 13.5 37 C14 34 15 32 16.5 31 C17 38 19 44 20 50 C20.5 54 20 57 20 60 L30 60 Z';
const BODY_LEG = 'M20 60 L30 60 L30 67 C29.5 67 29.2 67.5 29 69 C28.8 75 28.5 80 28.5 85 C28.5 90 28 94 27.5 98 C28 101 28 103 26.5 104 L18.5 104 C17.5 103 18.5 101 20.5 100 C21 96 21 92 20.5 88 C19.5 82 19 78 19.5 72 C20 67 19.5 63 20 60 Z';
const MIRROR = 'translate(60 0) scale(-1 1)';

function BodyFigure({ zone }: { zone: 'head' | 'body' | 'legs' }) {
  const fill = (z: string) => (z === zone ? 'var(--color-accent-red)' : 'rgba(255,255,255,0.25)');
  return (
    <svg viewBox="0 0 60 110" className="h-16 w-9 shrink-0" role="img" aria-label={zone}>
      <title>{zone}</title>
      <ellipse cx="30" cy="7.5" rx="6.3" ry="7.3" fill={fill('head')} />
      <g fill={fill('body')}>
        <path d={BODY_ARM_TORSO} />
        <path d={BODY_ARM_TORSO} transform={MIRROR} />
      </g>
      <g fill={fill('legs')}>
        <path d={BODY_LEG} />
        <path d={BODY_LEG} transform={MIRROR} />
      </g>
    </svg>
  );
}

/* Performance: shot placement, per-role record and weapon kills, all from the loaded matches. */
function PerformanceSection({
  matches,
  agents,
  roleLabel,
  language,
}: {
  matches: MatchSummary[];
  agents: ProfileResponse['agents'];
  roleLabel: (role: string) => string;
  language: string;
}) {
  const weapons = useWeapons(language);
  const [showAllWeapons, setShowAllWeapons] = useState(false);

  const hits = matches.reduce(
    (acc, m) => ({ head: acc.head + (m.head_hits ?? 0), body: acc.body + (m.body_hits ?? 0), leg: acc.leg + (m.leg_hits ?? 0) }),
    { head: 0, body: 0, leg: 0 },
  );
  const totalHits = hits.head + hits.body + hits.leg;

  const roleOf = new Map(agents.map((a) => [a.uuid, a]));
  const roleStats = new Map<string, { games: number; wins: number; losses: number; k: number; d: number; a: number; icon: string }>();
  for (const m of matches) {
    const agent = m.agent_uuid ? roleOf.get(m.agent_uuid) : undefined;
    if (!agent?.role) continue;
    const r = roleStats.get(agent.role) ?? { games: 0, wins: 0, losses: 0, k: 0, d: 0, a: 0, icon: agent.role_icon ?? '' };
    r.games += 1;
    if (m.won === true) r.wins += 1;
    if (m.won === false) r.losses += 1;
    r.k += m.kills;
    r.d += m.deaths;
    r.a += m.assists;
    roleStats.set(agent.role, r);
  }

  const kills = new Map<string, number>();
  for (const m of matches) {
    for (const [id, n] of Object.entries(m.weapon_kills ?? {})) {
      const key = weapons[id] ? id : 'ability';
      kills.set(key, (kills.get(key) ?? 0) + n);
    }
  }
  const weaponRows = [...kills].sort((a, b) => b[1] - a[1]);
  const topKills = weaponRows[0]?.[1] ?? 1;
  const shownWeapons = showAllWeapons ? weaponRows : weaponRows.slice(0, 5);
  const pct = (n: number) => (totalHits ? ((100 * n) / totalHits).toFixed(1) : '0.0');

  if (matches.length === 0) return null;
  return (
    <section>
      <SectionTitle hint={`From ${matches.length} loaded matches (follows the mode filter)`}>Performance</SectionTitle>

      <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-bg-card p-4">
        {([['head', hits.head], ['body', hits.body], ['legs', hits.leg]] as const).map(([zone, n]) => (
          <div key={zone} className="flex items-center gap-3">
            <BodyFigure zone={zone} />
            <div>
              <div className="text-2xl font-bold tabular-nums text-text-primary">{pct(n)}%</div>
              <div className="text-xs tabular-nums text-text-secondary">{n.toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>

      {roleStats.size > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[...roleStats]
            .sort((a, b) => b[1].games - a[1].games)
            .map(([role, r]) => {
              const decided = r.wins + r.losses;
              return (
                <div key={role} className="rounded-lg border border-border bg-bg-card p-3">
                  <div className="flex items-center gap-2">
                    {r.icon && <img src={r.icon} alt={roleLabel(role)} title={roleLabel(role)} className="h-8 w-8 object-contain" />}
                    {!r.icon && <span className="text-sm font-semibold text-text-primary">{roleLabel(role)}</span>}
                    <span className="flex-1" />
                    <span className="text-xs text-text-secondary">{r.games} games</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-secondary">
                    <div className="h-full rounded-full bg-accent-red" style={{ width: `${decided ? (100 * r.wins) / decided : 0}%` }} />
                  </div>
                  <dl className="mt-3 grid grid-cols-3 text-center">
                    <div><dd className="font-semibold tabular-nums text-text-primary">{decided ? Math.round((100 * r.wins) / decided) : 0}%</dd><dt className="text-[11px] text-text-secondary">Win rate</dt></div>
                    <div><dd className="font-semibold tabular-nums text-text-primary">{r.wins}-{r.losses}</dd><dt className="text-[11px] text-text-secondary">W-L</dt></div>
                    <div><dd className="font-semibold tabular-nums text-text-primary">{((r.k + r.a) / (r.d || 1)).toFixed(2)}</dd><dt className="text-[11px] text-text-secondary">KDA</dt></div>
                  </dl>
                </div>
              );
            })}
        </div>
      )}

      {weaponRows.length > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-bg-card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">Kills by weapon</h3>
          <ul className="space-y-2">
            {shownWeapons.map(([id, n]) => {
              const w = weapons[id];
              return (
                <li key={id} className="flex items-center gap-3">
                  <div className="flex h-10 w-20 shrink-0 items-center justify-center rounded-sm bg-bg-secondary">
                    {w?.icon ? (
                      <img src={w.icon} alt="" loading="lazy" className="max-h-8 max-w-[4.5rem] object-contain" />
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-6 w-6 text-text-secondary" fill="none" stroke="currentColor" strokeWidth="1.6" role="img" aria-label="Abilities">
                        <path d="M13 2 4 14h7l-1 8 9-12h-7z" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-text-primary">{w?.name ?? 'Abilities'}</span>
                      <span className="font-semibold tabular-nums text-text-primary">{n}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-secondary">
                      <div className="h-full rounded-full bg-accent-red" style={{ width: `${(100 * n) / topKills}%` }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {weaponRows.length > 5 && (
            <button type="button" onClick={() => setShowAllWeapons((v) => !v)} className="mt-3 w-full rounded-sm bg-bg-secondary py-2 text-xs text-text-secondary transition-colors hover:text-text-primary">
              {showAllWeapons ? 'Show less' : 'All weapons'}
            </button>
          )}
        </div>
      )}
    </section>
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
              <div className="rise-in mb-6" style={staggerStyle(0)}>
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
                  <CurrencyTile label="Valorant Points" value={profile.wallet.valorant_points} index={1} />
                  <CurrencyTile label="Radianite" value={profile.wallet.radianite_points} accent="var(--color-accent-teal)" index={2} />
                  <CurrencyTile label="Kingdom Credits" value={profile.wallet.kingdom_credits} accent="#e8c15a" index={3} />
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
                <div ref={roleRowRef} className="rise-in mb-4 flex flex-wrap items-center gap-2" style={staggerStyle(5)}>
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
                <div
                  // Keyed by the filter so choosing or clearing roles remounts the tiles and replays the entrance animation.
                  key={[...roleFilter].sort().join(',')}
                  className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9"
                >
                  {visibleAgents.map((agent, agentIndex) => {
                    const name = localizedName(agent.uuid, agent.name, localizedNames);
                    return (
                      // The entrance animation drives opacity and filter on this element, so the
                      // locked (dimmed, grey) look lives on the inner card to be there from frame one.
                      <div key={agent.uuid} title={agent.owned ? name : `${name} (locked)`} className="rise-in" style={staggerStyle(5 + agentIndex)}>
                        <div
                          className={`overflow-hidden rounded-lg border border-border bg-bg-card text-center ${
                            agent.owned ? '' : 'opacity-35 grayscale'
                          }`}
                        >
                          <AgentIcon src={agent.icon} alt={name} />
                          <div className="truncate px-1 py-1.5 text-[11px] text-text-primary">{name}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                </>
              )}
            </section>

            {!unavailable.has('matches') && (
              <PerformanceSection matches={visibleMatches} agents={profile.agents} roleLabel={roleLabel} language={language} />
            )}

            <section>
              <SectionTitle hint="Click a match for the full scoreboard">Match history</SectionTitle>
              {unavailable.has('matches') ? (
                <Unavailable what="Your match history" />
              ) : profile.matches.length === 0 ? (
                <p className="py-6 text-sm text-text-secondary">No recent matches found.</p>
              ) : (
                <>
                  <div ref={modeRowRef} className="rise-in mb-4 flex flex-wrap items-center gap-2" style={staggerStyle(5)}>
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
                  <ul key={[...queueFilter].sort().join(',')} className="space-y-3">
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

/* Square icon with a shimmering placeholder that fades out once the picture has arrived */
function AgentIcon({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative aspect-square w-full ${loaded ? '' : 'skeleton !border-0'}`}>
      <img
        src={src}
        alt={alt}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        ref={(img) => { if (img?.complete) setLoaded(true); }}
        className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
