import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ACTIVE_ROSTER_SIZE, isPitcher, overall, type Player } from '../../engine';
import { api, useGame, useSave, useUserTeam } from '../../state/game';
import { fullName } from '../format';
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
  const prospects = [...farm].sort((a, b) => pot(b) - pot(a)).filter((p) => p.age <= 24 && !farm.slice(0, 4).includes(p)).slice(0, 2);
  const list = [...farm.slice(0, 4), ...prospects];
  if (save.league.phase === 'offseason' || list.length === 0) return null;

  const up = (p: Player) => {
    if (!full) void act(() => api().setLevel(p.id, 'MLB'));
    else setCallUp(p);
  };

  return (
    <Card title="Triple-A">
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
                  <span className="block truncate text-xs text-muted">Age {p.age} · potential {pot(p)}</span>
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
