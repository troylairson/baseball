import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ACTIVE_ROSTER_SIZE, addDays, autoPlan, isPitcher, overall, type Player } from '../../engine';
import { api, useGame, useSave, useUserTeam } from '../../state/game';
import { formatDate, fullName } from '../format';
import { batLine, batText, pitLine, pitText } from '../home/form';
import { useOpenPlayer } from '../hooks';
import { scoutedOverall, scoutedPotential } from '../scouting';
import { statSummary, useLeagueRates, useStatsMap, warFor } from '../stats';
import { BottomSheet } from './BottomSheet';
import { Card } from './Card';
import { RatingBadge } from './Rating';

/** Your best hitters or pitchers right now: by WAR once the season is under way, by rating before. */
export function TeamLeaders({ side }: { side: 'bat' | 'pit' }) {
  const save = useSave();
  const team = useUserTeam();
  const stats = useStatsMap();
  const lg = useLeagueRates();
  const openPlayer = useOpenPlayer();
  const games = team.wins + team.losses;
  const early = games < 10;
  const mlb = save.players.filter((p) => p.teamId === team.id && p.level === 'MLB' && !p.retired && isPitcher(p) === (side === 'pit'));
  // Enough playing time to mean something: about a game's worth of PA (or innings) every other day.
  const played = (p: Player) => {
    const s = stats.get(p.id);
    return side === 'bat' ? (s?.bat.pa ?? 0) >= games * 1.5 : (s?.pit.outs ?? 0) >= games * 0.6;
  };
  const rows = (early ? mlb : mlb.filter(played))
    .map((p) => ({ p, war: !early && stats.get(p.id) ? warFor(p, stats.get(p.id)!, lg) : null, ovr: scoutedOverall(p, team.id).ovr }))
    .sort((a, b) => (early ? b.ovr - a.ovr : (b.war ?? 0) - (a.war ?? 0)))
    .slice(0, 4);

  return (
    <Card title={side === 'bat' ? 'Top hitters' : 'Pitching leaders'}>
      {early && <p className="-mt-1 mb-1 text-xs text-muted">By rating until the season gets going.</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No one qualifies yet.</p>
      ) : (
        <ol className="-mx-2">
          {rows.map(({ p, war, ovr }) => (
            <li key={p.id}>
              <button onClick={() => openPlayer(p.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2">
                <span className="w-8 shrink-0 text-center text-xs font-bold text-muted">{p.position}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{fullName(p)}</span>
                  <span className="block truncate text-xs text-muted">{statSummary(p, stats.get(p.id)) ?? `Age ${p.age}`}</span>
                </span>
                {war !== null ? (
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums">{war.toFixed(1)}</span>
                    <span className="block text-[10px] uppercase text-muted">WAR</span>
                  </span>
                ) : <RatingBadge value={ovr} size="sm" />}
              </button>
            </li>
          ))}
        </ol>
      )}
      <Link to="/play/league" className="mt-1 block rounded-lg py-1.5 text-center text-sm font-medium text-accent hover:bg-surface-2">League leaders</Link>
    </Card>
  );
}

/** The big leaguer a prospect would most naturally replace: same position (or role) first, weakest first. */
function replacements(org: Player[], prospect: Player, userTeamId: number): Player[] {
  const pitcher = isPitcher(prospect);
  const fits = (p: Player) => (pitcher ? p.position === prospect.position : !isPitcher(p) && (p.position === prospect.position || p.positionRatings[prospect.position as keyof Player['positionRatings']] !== undefined));
  const sameKind = (p: Player) => isPitcher(p) === pitcher;
  const ovr = (p: Player) => scoutedOverall(p, userTeamId).ovr;
  return org
    .filter((p) => p.level === 'MLB' && !p.injury)
    .sort((a, b) => Number(fits(b)) - Number(fits(a)) || Number(sameKind(b)) - Number(sameKind(a)) || ovr(a) - ovr(b));
}

/** Your Triple-A club at a glance, with call-ups (and the matching send-down) in a tap. */
export function FarmCard() {
  const save = useSave();
  const team = useUserTeam();
  const act = useGame((s) => s.act);
  const openPlayer = useOpenPlayer();
  const stats = useStatsMap();
  const [callUp, setCallUp] = useState<Player | null>(null);
  const org = save.players.filter((p) => p.teamId === team.id && !p.retired);
  const active = org.filter((p) => p.level === 'MLB' && !p.injury).length;
  const full = active >= ACTIVE_ROSTER_SIZE;
  const ovr = (p: Player) => scoutedOverall(p, team.id).ovr;
  const pot = (p: Player) => scoutedPotential(p, 'ovr', overall(p), ovr(p), overall(p, true), team.id);
  const farm = org.filter((p) => p.level === 'AAA' && !p.injury).sort((a, b) => ovr(b) - ovr(a) || pot(b) - pot(a));
  // Real Triple-A games: once there's a sample, lead with who's performing.
  const log = save.league.farm?.season === save.league.season ? save.league.farm : undefined;
  const line = (p: Player): string | null => {
    if (isPitcher(p)) {
      const g = log?.pit[p.id] ?? [];
      return g.length ? pitText(pitLine(g)) : null;
    }
    const g = log?.bat[p.id] ?? [];
    return g.length ? batText(batLine(g)) : null;
  };
  const performers = log && log.games >= 10 ? [
    ...farm.filter((p) => !isPitcher(p) && batLine(log.bat[p.id] ?? []).pa >= 30).sort((a, b) => batLine(log.bat[b.id]!).ops - batLine(log.bat[a.id]!).ops).slice(0, 3),
    ...farm.filter((p) => isPitcher(p) && pitLine(log.pit[p.id] ?? []).outs >= 45).sort((a, b) => pitLine(log.pit[a.id]!).era - pitLine(log.pit[b.id]!).era).slice(0, 2),
  ] : farm.slice(0, 4);
  const prospects = [...farm].sort((a, b) => pot(b) - pot(a)).filter((p) => p.age <= 24 && !performers.includes(p)).slice(0, 2);
  const list = [...performers, ...prospects];
  if (save.league.phase === 'offseason' || list.length === 0) return null;

  const up = (p: Player) => {
    if (!full) void act(() => api().setLevel(p.id, 'MLB'));
    else setCallUp(p);
  };

  return (
    <Card title={log?.games ? `Triple-A · ${log.wins}–${log.losses}` : 'Triple-A'}>
      <p className="-mt-1 mb-1 text-xs text-muted">Active roster {active}/{ACTIVE_ROSTER_SIZE}{full ? ': calling someone up sends someone down' : ''}.</p>
      <ul className="-mx-2">
        {list.map((p) => {
          const target = replacements(org, p, team.id)[0];
          const ready = !!target && ovr(p) > ovr(target);
          return (
            <li key={p.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-2">
              <button onClick={() => openPlayer(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="w-8 shrink-0 text-center text-xs font-bold text-muted">{p.position}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{fullName(p)}</span>
                  <span className="block truncate text-xs">{line(p) ?? <span className="text-muted">No Triple-A games yet</span>}</span>
                  <span className="block truncate text-[11px] text-muted">Age {p.age} · potential {pot(p)}</span>
                  {ready && <span className="block truncate text-xs font-semibold text-accent">Ready: better than {target!.lastName} now</span>}
                  {!ready && prospects.includes(p) && <span className="block truncate text-xs text-muted">Top prospect</span>}
                </span>
                <RatingBadge value={ovr(p)} size="sm" />
              </button>
              <button onClick={() => up(p)} className="h-8 shrink-0 rounded-lg border border-line px-2.5 text-xs font-semibold hover:bg-surface">Call up</button>
            </li>
          );
        })}
      </ul>
      <Link to="/play/roster" className="mt-1 block rounded-lg py-1.5 text-center text-sm font-medium text-accent hover:bg-surface-2">Full roster</Link>

      <BottomSheet open={!!callUp} onClose={() => setCallUp(null)} title="Make room">
        {callUp && (
          <div>
            <h2 className="pr-10 text-xl font-bold">Make room for {fullName(callUp)}</h2>
            <p className="mb-3 text-sm text-muted">The active roster is full. Who goes down to AAA? Closest fits first.</p>
            <ul className="-mx-2">
              {replacements(org, callUp, team.id).slice(0, 8).map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => {
                      setCallUp(null);
                      void act(() => api().swapLevels(callUp.id, p.id));
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2"
                  >
                    <span className="w-8 text-center text-xs font-bold text-muted">{p.position}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{fullName(p)}</span>
                      <span className="block truncate text-xs text-muted">{statSummary(p, stats.get(p.id)) ?? `Age ${p.age}`}</span>
                    </span>
                    <RatingBadge value={ovr(p)} size="sm" />
                    <span className="text-xs font-semibold text-accent">Send down</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </BottomSheet>
    </Card>
  );
}

/** Who's hurt, how long they're out, and who's filling in. */
export function InjuriesCard() {
  const save = useSave();
  const team = useUserTeam();
  const openPlayer = useOpenPlayer();
  const { league } = save;
  const org = save.players.filter((p) => p.teamId === team.id && !p.retired);
  const hurt = org.filter((p) => p.injury).sort((a, b) => a.injury!.days - b.injury!.days);
  // Who plays in their place: the healthy lineup and rotation as the staff would set them.
  const healthy = org.filter((p) => p.level === 'MLB' && !p.injury);
  const plan = autoPlan(healthy, league.settings.designatedHitter);
  const byId = new Map(org.map((p) => [p.id, p]));
  const coverFor = (p: Player): string | null => {
    if (p.level !== 'MLB') return null;
    if (p.position === 'SP') {
      const fifth = byId.get(plan.rotation[plan.rotation.length - 1] ?? -1);
      return fifth ? `${fifth.lastName} takes his turn in the rotation` : null;
    }
    if (p.position === 'RP') return null;
    const slot = plan.lineup.find((s) => s.position === p.position);
    const sub = slot ? byId.get(slot.playerId) : undefined;
    return sub ? `${sub.lastName} plays ${p.position}` : null;
  };
  return (
    <Card title={hurt.length ? `Injured list (${hurt.length})` : 'Injured list'}>
      {hurt.length === 0 ? (
        <p className="text-sm text-muted">Everyone's healthy.</p>
      ) : (
        <ul className="-mx-2">
          {hurt.map((p) => {
            const days = p.injury!.days;
            const cover = coverFor(p);
            return (
              <li key={p.id}>
                <button onClick={() => openPlayer(p.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2">
                  <span className="w-8 shrink-0 text-center text-xs font-bold text-muted">{p.position}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{fullName(p)}{p.level === 'AAA' && <span className="text-xs font-normal text-muted"> · AAA</span>}</span>
                    <span className="block truncate text-xs text-muted">{p.injury!.description}{cover ? ` · ${cover}` : ''}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block text-sm font-semibold tabular-nums ${days <= 7 ? 'text-accent' : ''}`}>{days <= 7 ? 'This week' : `${days} days`}</span>
                    <span className="block text-[11px] text-muted">back ~{formatDate(addDays(league.date, days)).replace(/, \d{4}$/, '')}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Your hottest and coldest players: the last 15 games (5 outings for pitchers) against their season. */
export function HotColdCard() {
  const save = useSave();
  const team = useUserTeam();
  const openPlayer = useOpenPlayer();
  const log = save.league.userLog?.season === save.league.season ? save.league.userLog : undefined;
  const byId = new Map(save.players.map((p) => [p.id, p]));
  type Row = { p: Player; score: number; recent: string; season: string };
  const rows: Row[] = [];
  for (const [id, games] of Object.entries(log?.bat ?? {})) {
    const p = byId.get(Number(id));
    if (!p || p.teamId !== team.id || isPitcher(p) || games.length < 20) continue;
    const recent = batLine(games.slice(-15));
    if (recent.pa < 35) continue;
    const season = batLine(games);
    rows.push({ p, score: (recent.ops - season.ops) / 0.15, recent: batText(recent), season: `${batText(season).split(' · ')[0]} season` });
  }
  for (const [id, games] of Object.entries(log?.pit ?? {})) {
    const p = byId.get(Number(id));
    if (!p || p.teamId !== team.id || games.length < 8) continue;
    const window = games.slice(p.position === 'SP' ? -5 : -8);
    const recent = pitLine(window);
    if (recent.outs < 15) continue;
    const season = pitLine(games);
    rows.push({ p, score: (season.era - recent.era) / 1.5, recent: pitText(recent), season: `${season.era.toFixed(2)} ERA season` });
  }
  const hot = rows.filter((r) => r.score >= 0.6).sort((a, b) => b.score - a.score).slice(0, 3);
  const cold = rows.filter((r) => r.score <= -0.6).sort((a, b) => a.score - b.score).slice(0, 3);
  const list = (title: string, items: Row[], tone: string, icon: string) => (
    <div>
      <p className={`mb-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>{icon} {title}</p>
      {items.length === 0 ? <p className="mb-2 text-sm text-muted">Nobody right now.</p> : (
        <ul className="-mx-2 mb-1">
          {items.map((r) => (
            <li key={r.p.id}>
              <button onClick={() => openPlayer(r.p.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2">
                <span className="w-8 shrink-0 text-center text-xs font-bold text-muted">{r.p.position}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{fullName(r.p)}</span>
                  <span className="block truncate text-xs">{r.recent}</span>
                  <span className="block truncate text-[11px] text-muted">vs {r.season}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <Card title="Hot & cold">
      {rows.length === 0 ? <p className="text-sm text-muted">Streaks show up a few weeks into the season.</p> : (
        <>
          {list('Hot: last 15 games / 5 starts', hot, 'text-accent', '▲')}
          {list('Cold', cold, 'text-danger', '▼')}
        </>
      )}
    </Card>
  );
}
