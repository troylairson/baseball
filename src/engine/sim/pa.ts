import type { BattingRatings, BatSide, Hand, PitchingRatings } from '../model/types';
import type { Rng } from '../rng';

/** League-average rates per plate appearance (modern MLB baseline). */
export const LEAGUE = {
  k: 0.226,
  bb: 0.075,
  hbp: 0.011,
  hr: 0.028,
  /** Batting average on balls in play. */
  babip: 0.292,
  /** Share of non-HR hits that are doubles / triples. */
  doubleShare: 0.205,
  tripleShare: 0.018,
  error: 0.016,
};

export type PaResult =
  | 'K' | 'BB' | 'HBP' | 'HR' | '1B' | '2B' | '3B' | 'GO' | 'FO' | 'LO' | 'E';

const f = (rating: number, k: number) => Math.exp((k * (rating - 50)) / 10);

/** Combine batter and pitcher rates relative to the league rate (odds-ratio / log5). */
export function log5(batter: number, pitcher: number, league: number): number {
  const num = (batter * pitcher) / league;
  return num / (num + ((1 - batter) * (1 - pitcher)) / (1 - league));
}

export interface PaContext {
  bat: BattingRatings;
  bats: BatSide;
  pitch: PitchingRatings;
  throws: Hand;
  /** Fielding team defense on the 20–80 scale. */
  defense: number;
}

export interface PaProbabilities {
  k: number;
  bb: number;
  hbp: number;
  hr: number;
  babip: number;
}

export function paProbabilities(ctx: PaContext): PaProbabilities {
  const { bat, pitch } = ctx;
  const side = ctx.bats === 'S' ? (ctx.throws === 'L' ? 'R' : 'L') : ctx.bats;
  const sameSide = side === ctx.throws;
  const platoon = sameSide ? { k: 1.07, hr: 0.9, babip: -0.007, bb: 0.95 } : { k: 0.97, hr: 1.04, babip: 0.003, bb: 1.02 };

  const kB = LEAGUE.k * f(bat.contact, -0.3) * f(bat.eye, -0.06);
  const kP = LEAGUE.k * f(pitch.stuff, 0.22) * f(pitch.movement, 0.03);
  const bbB = LEAGUE.bb * f(bat.eye, 0.32);
  const bbP = LEAGUE.bb * f(pitch.control, -0.25);
  const hrB = LEAGUE.hr * f(bat.power, 0.33);
  const hrP = LEAGUE.hr * f(pitch.movement, -0.22) * f(pitch.stuff, -0.06);
  const babipB = LEAGUE.babip + (bat.contact - 50) * 0.0018 + (bat.speed - 50) * 0.0006;
  const babipP = LEAGUE.babip - (pitch.movement - 50) * 0.0008 - (pitch.stuff - 50) * 0.0003;

  return {
    k: log5(kB, kP, LEAGUE.k) * platoon.k,
    bb: log5(bbB, bbP, LEAGUE.bb) * platoon.bb,
    hbp: LEAGUE.hbp,
    hr: log5(hrB, hrP, LEAGUE.hr) * platoon.hr,
    babip: babipB + babipP - LEAGUE.babip + platoon.babip - (ctx.defense - 50) * 0.0025,
  };
}

export function resolvePa(ctx: PaContext, rng: Rng): PaResult {
  const p = paProbabilities(ctx);
  let u = rng.next();
  if ((u -= p.k) < 0) return 'K';
  if ((u -= p.bb) < 0) return 'BB';
  if ((u -= p.hbp) < 0) return 'HBP';
  if (u - p.hr < 0) return 'HR';

  // Ball in play.
  if (rng.chance(p.babip)) {
    const triple = LEAGUE.tripleShare * f(ctx.bat.speed, 0.6);
    const double = LEAGUE.doubleShare * f(ctx.bat.power, 0.15);
    const h = rng.next();
    if (h < triple) return '3B';
    if (h < triple + double) return '2B';
    return '1B';
  }
  if (rng.chance(LEAGUE.error * f(ctx.defense, -0.3))) return 'E';
  const t = rng.next();
  return t < 0.45 ? 'GO' : t < 0.8 ? 'FO' : 'LO';
}

/** Approximate pitches thrown in a plate appearance. */
export function pitchesFor(result: PaResult, rng: Rng): number {
  const base = result === 'K' ? 4.8 : result === 'BB' ? 5.7 : result === 'HBP' ? 3 : 3.3;
  return Math.max(1, Math.round(base + rng.normal(0, 1.2)));
}
