import type { BattingLine, PitchingLine } from './stats';
import { singles } from './stats';
import type { Position } from './types';

/**
 * A deliberately simple WAR approximation, good enough for awards and
 * player value: linear-weight batting runs plus a positional adjustment,
 * and runs-allowed-vs-league for pitchers, each against replacement level.
 */
const W = { bb: 0.69, hbp: 0.72, b1: 0.89, b2: 1.27, b3: 1.62, hr: 2.1 };
const RUNS_PER_WIN = 10;

/** Positional runs per 600 PA (from the standard scale). */
const POSITION_RUNS: Partial<Record<Position, number>> = {
  C: 10, SS: 7, '2B': 3, CF: 3, '3B': 2, LF: -7, RF: -7, '1B': -12, DH: -17,
};

export function woba(b: BattingLine): number {
  const denom = b.ab + b.bb + b.hbp + b.sf;
  if (!denom) return 0;
  return (W.bb * b.bb + W.hbp * b.hbp + W.b1 * singles(b) + W.b2 * b.d + W.b3 * b.t + W.hr * b.hr) / denom;
}

export interface LeagueContext {
  woba: number;
  /** Runs allowed per nine innings. */
  ra9: number;
}

export function battingWar(b: BattingLine, position: Position, lg: LeagueContext): number {
  if (!b.pa) return 0;
  const battingRuns = ((woba(b) - lg.woba) / 1.2) * b.pa;
  const baserunning = b.sb * 0.2 - b.cs * 0.4;
  const positional = ((POSITION_RUNS[position] ?? 0) * b.pa) / 600;
  const replacement = (20 * b.pa) / 600;
  return (battingRuns + baserunning + positional + replacement) / RUNS_PER_WIN;
}

export function pitchingWar(p: PitchingLine, lg: LeagueContext): number {
  if (!p.outs) return 0;
  const ip = p.outs / 3;
  const ra9 = (p.r * 9) / ip;
  // Replacement level ≈ 1.3 runs/9 worse than average for starters, less for relievers.
  const starterShare = p.g ? p.gs / p.g : 0;
  const replacement = lg.ra9 + 0.8 + starterShare * 0.5;
  return (((replacement - ra9) * ip) / 9) / RUNS_PER_WIN;
}

export function leagueContext(lines: { bat: BattingLine; pit: PitchingLine }[]): LeagueContext {
  let num = 0;
  let den = 0;
  let runs = 0;
  let outs = 0;
  for (const { bat, pit } of lines) {
    num += W.bb * bat.bb + W.hbp * bat.hbp + W.b1 * singles(bat) + W.b2 * bat.d + W.b3 * bat.t + W.hr * bat.hr;
    den += bat.ab + bat.bb + bat.hbp + bat.sf;
    runs += pit.r;
    outs += pit.outs;
  }
  return { woba: den ? num / den : 0.315, ra9: outs ? (runs * 27) / outs : 4.4 };
}
