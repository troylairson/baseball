import { useMemo } from 'react';
import {
  avg, battingWar, era, ipString, isPitcher, leagueRates, obp, ops, pitchingWar, rate3, slg, whip,
  type LeagueRates, type Player, type PlayerSeasonStats,
} from '../engine';
import { useSave } from '../state/game';

/** League rates for the current season (for OPS+, ERA+, FIP, WAR). */
export function useLeagueRates(): LeagueRates {
  const { stats } = useSave();
  return useMemo(() => leagueRates(stats), [stats]);
}

export function warFor(player: Player, s: PlayerSeasonStats, lg: LeagueRates): number {
  return isPitcher(player) ? pitchingWar(s.pit, lg) : battingWar(s.bat, player.position, lg);
}

export function useStatsMap(): Map<number, PlayerSeasonStats> {
  const { stats } = useSave();
  return useMemo(() => new Map(stats.map((s) => [s.playerId, s])), [stats]);
}

/** One-line summary for player cards: "AVG/OBP/SLG · HR · RBI" or "ERA · IP · K". */
export function statSummary(player: Player, s: PlayerSeasonStats | undefined): string | null {
  if (!s) return null;
  if (isPitcher(player)) {
    if (!s.pit.g) return null;
    const record = s.pit.gs ? `${s.pit.w}-${s.pit.l}, ` : s.pit.sv ? `${s.pit.sv} SV, ` : '';
    return `${record}${era(s.pit).toFixed(2)} ERA · ${ipString(s.pit.outs)} IP · ${s.pit.so} K`;
  }
  if (!s.bat.pa) return null;
  return `${rate3(avg(s.bat))}/${rate3(obp(s.bat))}/${rate3(slg(s.bat))} · ${s.bat.hr} HR · ${s.bat.rbi} RBI`;
}

export interface LeaderCtx {
  lg: LeagueRates;
  player: Player | undefined;
}

export interface Leader {
  key: string;
  label: string;
  format: (s: PlayerSeasonStats, c: LeaderCtx) => string;
  value: (s: PlayerSeasonStats, c: LeaderCtx) => number;
  /** Lower is better (ERA, WHIP). */
  ascending?: boolean;
  /** Needs a qualifying number of PA / IP. */
  rate?: boolean;
  pitching?: boolean;
}

const war = (s: PlayerSeasonStats, c: LeaderCtx) => (c.player ? warFor(c.player, s, c.lg) : 0);

export const BATTING_LEADERS: Leader[] = [
  { key: 'war', label: 'WAR (hitters)', value: war, format: (s, c) => war(s, c).toFixed(1) },
  { key: 'avg', label: 'Batting Average', value: (s) => avg(s.bat), format: (s) => rate3(avg(s.bat)), rate: true },
  { key: 'hr', label: 'Home Runs', value: (s) => s.bat.hr, format: (s) => String(s.bat.hr) },
  { key: 'rbi', label: 'RBI', value: (s) => s.bat.rbi, format: (s) => String(s.bat.rbi) },
  { key: 'ops', label: 'OPS', value: (s) => ops(s.bat), format: (s) => rate3(ops(s.bat)), rate: true },
  { key: 'sb', label: 'Stolen Bases', value: (s) => s.bat.sb, format: (s) => String(s.bat.sb) },
];

export const PITCHING_LEADERS: Leader[] = [
  { key: 'pwar', label: 'WAR (pitchers)', value: war, format: (s, c) => war(s, c).toFixed(1), pitching: true },
  { key: 'era', label: 'ERA', value: (s) => era(s.pit), format: (s) => era(s.pit).toFixed(2), ascending: true, rate: true, pitching: true },
  { key: 'so', label: 'Strikeouts', value: (s) => s.pit.so, format: (s) => String(s.pit.so), pitching: true },
  { key: 'w', label: 'Wins', value: (s) => s.pit.w, format: (s) => String(s.pit.w), pitching: true },
  { key: 'sv', label: 'Saves', value: (s) => s.pit.sv, format: (s) => String(s.pit.sv), pitching: true },
  { key: 'whip', label: 'WHIP', value: (s) => whip(s.pit), format: (s) => whip(s.pit).toFixed(2), ascending: true, rate: true, pitching: true },
];

/** Top N for a leaderboard, applying MLB-style qualifiers (3.1 PA / 1 IP per team game). */
export function leaders(
  stats: PlayerSeasonStats[], leader: Leader, teamGames: number, ctxFor: (s: PlayerSeasonStats) => LeaderCtx, n = 5,
): PlayerSeasonStats[] {
  const qualified = stats.filter((s) => {
    const p = ctxFor(s).player;
    // Hitting leaderboards are for position players; pitching ones for pitchers.
    if (p && isPitcher(p) !== !!leader.pitching) return false;
    if (!leader.rate) return leader.pitching ? s.pit.g > 0 : s.bat.pa > 0;
    return leader.pitching ? s.pit.outs >= teamGames * 3 : s.bat.pa >= teamGames * 3.1;
  });
  const v = (s: PlayerSeasonStats) => leader.value(s, ctxFor(s));
  return qualified.sort((a, b) => (leader.ascending ? v(a) - v(b) : v(b) - v(a))).slice(0, n);
}
