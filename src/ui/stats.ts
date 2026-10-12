import { useMemo } from 'react';
import {
  avg, era, ipString, isPitcher, obp, ops, rate3, slg, whip,
  type Player, type PlayerSeasonStats,
} from '../engine';
import { useSave } from '../state/game';

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

export interface Leader {
  key: string;
  label: string;
  format: (s: PlayerSeasonStats) => string;
  value: (s: PlayerSeasonStats) => number;
  /** Lower is better (ERA, WHIP). */
  ascending?: boolean;
  /** Needs a qualifying number of PA / IP. */
  rate?: boolean;
  pitching?: boolean;
}

export const BATTING_LEADERS: Leader[] = [
  { key: 'avg', label: 'Batting Average', value: (s) => avg(s.bat), format: (s) => rate3(avg(s.bat)), rate: true },
  { key: 'hr', label: 'Home Runs', value: (s) => s.bat.hr, format: (s) => String(s.bat.hr) },
  { key: 'rbi', label: 'RBI', value: (s) => s.bat.rbi, format: (s) => String(s.bat.rbi) },
  { key: 'ops', label: 'OPS', value: (s) => ops(s.bat), format: (s) => rate3(ops(s.bat)), rate: true },
  { key: 'sb', label: 'Stolen Bases', value: (s) => s.bat.sb, format: (s) => String(s.bat.sb) },
];

export const PITCHING_LEADERS: Leader[] = [
  { key: 'era', label: 'ERA', value: (s) => era(s.pit), format: (s) => era(s.pit).toFixed(2), ascending: true, rate: true, pitching: true },
  { key: 'so', label: 'Strikeouts', value: (s) => s.pit.so, format: (s) => String(s.pit.so), pitching: true },
  { key: 'w', label: 'Wins', value: (s) => s.pit.w, format: (s) => String(s.pit.w), pitching: true },
  { key: 'sv', label: 'Saves', value: (s) => s.pit.sv, format: (s) => String(s.pit.sv), pitching: true },
  { key: 'whip', label: 'WHIP', value: (s) => whip(s.pit), format: (s) => whip(s.pit).toFixed(2), ascending: true, rate: true, pitching: true },
];

/** Top N for a leaderboard, applying MLB-style qualifiers (3.1 PA / 1 IP per team game). */
export function leaders(stats: PlayerSeasonStats[], leader: Leader, teamGames: number, n = 5): PlayerSeasonStats[] {
  const qualified = stats.filter((s) => {
    if (!leader.rate) return leader.pitching ? s.pit.g > 0 : s.bat.pa > 0;
    return leader.pitching ? s.pit.outs >= teamGames * 3 : s.bat.pa >= teamGames * 3.1;
  });
  return qualified
    .sort((a, b) => (leader.ascending ? leader.value(a) - leader.value(b) : leader.value(b) - leader.value(a)))
    .slice(0, n);
}
