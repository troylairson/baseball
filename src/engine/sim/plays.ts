import type { Rng } from '../rng';
import type { PitchType } from '../model/pitches';
import type { PaResult } from './pa';

/**
 * Structured play-by-play for the animated field. The sim decides every
 * outcome first; the details here (where the ball went, how hard, the pitch
 * sequence) are drawn afterwards from a separate cosmetic stream and are
 * constrained to agree with that outcome. They never change results.
 */

/** Scorekeeping position numbers: 1 P, 2 C, 3 1B, 4 2B, 5 3B, 6 SS, 7 LF, 8 CF, 9 RF. */
export type Fielder = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type Pitch = 'B' | 'S' | 'F' | 'X' | 'H';

export type BattedBallType = 'ground' | 'line' | 'fly' | 'popup' | 'bunt';

export interface BattedBall {
  type: BattedBallType;
  /** Spray angle in degrees: -45 is the third-base line, +45 the first-base line. */
  angle: number;
  /** Feet from home plate where the ball lands or is fielded. */
  distance: number;
  /** Peak height in feet. */
  apex: number;
  exitVelo: number;
  launchAngle: number;
}

/** A runner's movement on a play. Bases: 0 home (batter), 1–3, 4 = scored. */
export interface RunnerMove {
  id: number;
  from: 0 | 1 | 2 | 3;
  to: 0 | 1 | 2 | 3 | 4;
  /** Put out at `to` (or, with to = 0, retired at the plate: strikeout or caught ball). */
  out: boolean;
}

export type PlayResult = PaResult | 'IBB' | 'SAC' | 'BUNT_HIT' | 'FC' | 'SF' | 'DP';

export interface PlayEvent {
  kind: 'pa' | 'steal' | 'pitchingChange' | 'pinchHit';
  inning: number;
  half: 'top' | 'bottom';
  outsBefore: number;
  outsAfter: number;
  battingTeamId: number;
  batterId?: number;
  pitcherId?: number;
  /** Incoming player for substitutions. */
  playerId?: number;
  result?: PlayResult;
  pitches?: Pitch[];
  /** Pitch type and speed (mph) for each pitch, when the pitcher's repertoire is known. */
  pitchTypes?: PitchType[];
  velos?: number[];
  ball?: BattedBall;
  /** Fielders who handled the ball, in order (6-4-3). */
  fielders?: Fielder[];
  /** Fielder charged with an error. */
  error?: Fielder;
  runners: RunnerMove[];
  text: string;
  awayRuns: number;
  homeRuns: number;
}

// ---------------------------------------------------------------------------
// Field geometry (feet; angle 0 = straight to center field)

/** Standard defensive spots: [angle, distance]. */
export const FIELDER_SPOTS: Record<Fielder, [number, number]> = {
  1: [0, 58],
  2: [0, -12],
  3: [36, 105],
  4: [13, 148],
  5: [-36, 102],
  6: [-13, 148],
  7: [-29, 285],
  8: [0, 315],
  9: [29, 285],
};

/** Fence distance by spray angle: 330 down the lines, 400 to center. */
export function fenceDistance(angle: number): number {
  const t = Math.min(1, Math.abs(angle) / 45);
  return 400 - 70 * t * t;
}

const DIRECTION_RANGES: [number, number][] = [[-44, -27], [-27, -9], [-9, 9], [9, 27], [27, 44]];

const outfielderFor = (angle: number): Fielder => (angle < -15 ? 7 : angle > 15 ? 9 : 8);
const infielderFor = (angle: number): Fielder => (angle < -25 ? 5 : angle < -2 ? 6 : angle < 22 ? 4 : 3);
/** Middle infielder who goes out for the relay. */
const cutoffFor = (angle: number): Fielder => (angle < 0 ? 6 : 4);

/** Spray angle, leaning toward the batter's pull side. */
function sprayAngle(rng: Rng, pullSide: -1 | 1, direction?: number): number {
  if (direction !== undefined) {
    const [lo, hi] = DIRECTION_RANGES[direction]!;
    return lo + rng.next() * (hi - lo);
  }
  const a = rng.normal(pullSide * 9, 19);
  return Math.max(-44, Math.min(44, a));
}

const between = (rng: Rng, lo: number, hi: number) => lo + rng.next() * (hi - lo);

export interface BallSpec {
  ball?: BattedBall;
  fielders?: Fielder[];
  error?: Fielder;
}

/**
 * Where the ball went for a given outcome. `direction` is the index (0 left …
 * 4 right) used in the text log, so the picture matches the words.
 */
export function battedBallFor(result: PlayResult, rng: Rng, opts: { bats: 'L' | 'R'; power: number; direction?: number; popup?: boolean }): BallSpec {
  const pull: -1 | 1 = opts.bats === 'L' ? 1 : -1;
  const powerBoost = (opts.power - 50) * 0.25;
  const angle = sprayAngle(rng, pull, opts.direction);
  const ball = (type: BattedBallType, distance: number, apex: number, ev: [number, number], la: [number, number]): BattedBall => ({
    type, angle, distance: Math.round(distance), apex: Math.round(apex),
    exitVelo: Math.round(between(rng, ev[0], ev[1]) + powerBoost * 0.3), launchAngle: Math.round(between(rng, la[0], la[1])),
  });
  switch (result) {
    case 'K': case 'BB': case 'HBP': case 'IBB':
      return {};
    case 'HR': {
      const fence = fenceDistance(angle);
      return { ball: ball('fly', fence + between(rng, 8, 60) + powerBoost, between(rng, 85, 130), [101, 113], [23, 36]) };
    }
    case '2B': case '3B': {
      // Gaps and lines; the outfielder retrieves at the wall and hits the cutoff.
      const gapAngle = opts.direction !== undefined ? angle : rng.pick([-36, -18, 18, 36]) + rng.normal(0, 4);
      const fence = fenceDistance(gapAngle);
      const line = rng.chance(0.45);
      const b = ball(line ? 'line' : 'fly', fence - between(rng, 5, result === '3B' ? 15 : 45), line ? between(rng, 18, 35) : between(rng, 45, 80), [96, 110], line ? [11, 19] : [20, 30]);
      b.angle = gapAngle;
      return { ball: b, fielders: [outfielderFor(gapAngle), cutoffFor(gapAngle)] };
    }
    case '1B': {
      const kind = rng.weighted([['ground', 5], ['line', 3], ['blooper', 2]] as const);
      if (kind === 'ground') {
        // Through a hole between infielders.
        const hole = rng.pick([-25, -3, 23]) + rng.normal(0, 4);
        const b = ball('ground', between(rng, 200, 245), 3, [88, 104], [-6, 6]);
        b.angle = hole;
        return { ball: b, fielders: [outfielderFor(hole)] };
      }
      if (kind === 'line') return { ball: ball('line', between(rng, 200, 250), between(rng, 12, 22), [95, 108], [10, 17]), fielders: [outfielderFor(angle)] };
      return { ball: ball('fly', between(rng, 165, 210), between(rng, 35, 55), [75, 88], [28, 40]), fielders: [outfielderFor(angle)] };
    }
    case 'GO': case 'E': case 'FC': case 'DP': {
      const fielder = rng.chance(0.06) ? 1 : infielderFor(angle);
      const [, depth] = FIELDER_SPOTS[fielder];
      const b = ball('ground', depth + between(rng, -8, 6), 2, [78, 102], [-14, 4]);
      if (result === 'E') return { ball: b, fielders: [fielder], error: fielder };
      if (result === 'DP') {
        const pivot: Fielder = fielder === 4 || fielder === 3 ? 6 : 4;
        return { ball: b, fielders: fielder === 3 ? [3, 6, 1] : [fielder, pivot, 3] };
      }
      if (result === 'FC') return { ball: b, fielders: [fielder, angle < 0 ? 4 : 6] };
      // 1B fields it himself and steps on the bag; everyone else throws across.
      return { ball: b, fielders: fielder === 3 && rng.chance(0.6) ? [3] : [fielder, 3] };
    }
    case 'FO': case 'SF': {
      if (result === 'FO' && opts.popup) {
        const b = ball('popup', between(rng, 60, 160), between(rng, 110, 160), [65, 82], [52, 66]);
        return { ball: b, fielders: [b.distance < 95 ? (rng.chance(0.5) ? 2 : 1) : infielderFor(angle)] };
      }
      const deep = result === 'SF' ? between(rng, 290, 350) : between(rng, 240, 360);
      return { ball: ball('fly', Math.min(deep, fenceDistance(angle) - 12), between(rng, 70, 115), [88, 104], [26, 44]), fielders: [outfielderFor(angle)] };
    }
    case 'LO': {
      const infield = rng.chance(0.4);
      if (infield) {
        const f = infielderFor(angle);
        return { ball: ball('line', FIELDER_SPOTS[f][1] - 5, between(rng, 6, 12), [92, 108], [8, 15]), fielders: [f] };
      }
      return { ball: ball('line', between(rng, 230, 300), between(rng, 18, 30), [95, 109], [12, 19]), fielders: [outfielderFor(angle)] };
    }
    case 'SAC': case 'BUNT_HIT': {
      const side = rng.chance(0.5) ? -1 : 1;
      const b = ball('bunt', between(rng, 25, 45), 1, [35, 52], [-20, -5]);
      b.angle = side * between(rng, 18, 38);
      const fielder: Fielder = rng.chance(0.4) ? 1 : side < 0 ? 5 : 3;
      return { ball: b, fielders: result === 'SAC' ? (fielder === 3 ? [3, 4] : [fielder, 3]) : [fielder] };
    }
  }
}

/** A pitch sequence of about `count` pitches that ends the way the plate appearance did. */
export function pitchSequence(result: PlayResult, count: number, rng: Rng): Pitch[] {
  if (result === 'IBB') return [];
  const last: Pitch = result === 'K' ? 'S' : result === 'BB' ? 'B' : result === 'HBP' ? 'H' : 'X';
  // Count before the final pitch.
  let balls = 0;
  let strikes = 0;
  const seq: Pitch[] = [];
  const maxBalls = result === 'BB' ? 3 : 3;
  const maxStrikes = 2;
  const needBalls = result === 'BB' ? 3 : 0;
  const needStrikes = result === 'K' ? 2 : 0;
  const target = Math.max(1, Math.min(12, count)) - 1;
  while (seq.length < target || balls < needBalls || strikes < needStrikes) {
    const mustBall = balls < needBalls && target - seq.length <= needBalls - balls;
    const mustStrike = strikes < needStrikes && target - seq.length <= needStrikes - strikes;
    let p: Pitch;
    if (mustBall && balls < maxBalls) p = 'B';
    else if (mustStrike && strikes < maxStrikes) p = rng.chance(0.5) ? 'S' : 'F';
    else if (strikes >= maxStrikes) p = balls < maxBalls && rng.chance(0.45) ? 'B' : 'F';
    else if (balls >= maxBalls) p = rng.chance(0.55) ? 'S' : 'F';
    else p = rng.weighted([['B', 37], ['S', 33], ['F', 30]] as const);
    seq.push(p);
    if (p === 'B') balls++;
    else if (p === 'S' || strikes < maxStrikes) strikes = Math.min(maxStrikes, strikes + 1);
    if (seq.length > 14) break;
  }
  seq.push(last);
  return seq;
}

/** The count (balls, strikes) after each pitch, for the scoreboard. */
export function countAfter(pitches: Pitch[], n: number): [number, number] {
  let b = 0;
  let s = 0;
  for (const p of pitches.slice(0, n)) {
    if (p === 'B') b = Math.min(4, b + 1);
    else if (p === 'S') s = Math.min(3, s + 1);
    else if (p === 'F' && s < 2) s++;
  }
  return [b, s];
}
