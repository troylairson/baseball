import { clampRating } from '../model/ratings';
import type {
  BatSide, BattingRatings, FieldPosition, Hand, PitchingRatings, Player, Position, Rating, RosterLevel,
} from '../model/types';
import type { Rng } from '../rng';
import { FIRST_NAMES, LAST_NAMES } from './names';

export interface PlayerSpec {
  id: number;
  position: Position;
  /** Mean talent on the 20–80 scale for the player's current ability. */
  talent: number;
  age: number;
  teamId: number | null;
  level: RosterLevel;
}

/** Positions a player can also handle, with a defensive penalty. */
const SECONDARY: Record<FieldPosition, [FieldPosition, number][]> = {
  C: [['1B', -5]],
  '1B': [['LF', -10], ['RF', -10]],
  '2B': [['SS', -6], ['3B', -5], ['1B', -2]],
  '3B': [['1B', -2], ['2B', -8]],
  SS: [['2B', 0], ['3B', -2]],
  LF: [['RF', -3], ['1B', -5]],
  CF: [['LF', 2], ['RF', 0]],
  RF: [['LF', 2], ['1B', -5]],
};

/** How many points of growth remain, on average, at a given age. */
function growthForAge(age: number, rng: Rng): number {
  if (age <= 20) return rng.normal(13, 4);
  if (age <= 22) return rng.normal(9, 3.5);
  if (age <= 24) return rng.normal(5, 2.5);
  if (age <= 26) return rng.normal(2, 1.5);
  return 0;
}

function grow(current: Rating, growth: number, rng: Rng): Rating {
  if (growth <= 0) return current;
  return clampRating(current + Math.max(0, growth + rng.normal(0, 2.5)));
}

function batting(talent: number, position: Position, rng: Rng): BattingRatings {
  // Archetypes give hitters a shape instead of flat ratings.
  const archetype = rng.weighted([
    ['balanced', 4], ['slugger', 2], ['contact', 2], ['speedster', 1],
  ] as const);
  const shape = {
    balanced: [0, 0, 0, 0],
    slugger: [-4, 8, 2, -6],
    contact: [7, -6, 2, 2],
    speedster: [3, -7, 0, 12],
  }[archetype];
  // Up-the-middle defenders trade some bat for glove.
  const glovePenalty = position === 'C' || position === 'SS' ? -3 : position === '2B' || position === 'CF' ? -1 : 0;
  const pitcherPenalty = position === 'SP' || position === 'RP' ? -22 : 0;
  const base = talent + glovePenalty + pitcherPenalty;
  return {
    contact: clampRating(base + shape[0]! + rng.normal(0, 5)),
    power: clampRating(base + shape[1]! + rng.normal(0, 6)),
    eye: clampRating(base + shape[2]! + rng.normal(0, 5)),
    speed: clampRating(50 + shape[3]! + (position === 'C' ? -10 : position === 'CF' || position === 'SS' ? 6 : 0) + rng.normal(0, 9)),
  };
}

function pitching(talent: number, starter: boolean, rng: Rng): PitchingRatings {
  const archetype = rng.weighted([['balanced', 3], ['power', 2], ['finesse', 2]] as const);
  const shape = { balanced: [0, 0, 0], power: [7, -5, -1], finesse: [-5, 6, 3] }[archetype];
  return {
    stuff: clampRating(talent + shape[0]! + rng.normal(0, 6)),
    control: clampRating(talent + shape[1]! + rng.normal(0, 6)),
    movement: clampRating(talent + shape[2]! + rng.normal(0, 6)),
    stamina: clampRating(starter ? rng.normal(62, 7) : rng.normal(35, 8)),
  };
}

function growBatting(b: BattingRatings, growth: number, rng: Rng): BattingRatings {
  return {
    contact: grow(b.contact, growth, rng),
    power: grow(b.power, growth * 1.1, rng),
    eye: grow(b.eye, growth * 0.9, rng),
    speed: b.speed,
  };
}

function growPitching(p: PitchingRatings, growth: number, rng: Rng): PitchingRatings {
  return {
    stuff: grow(p.stuff, growth, rng),
    control: grow(p.control, growth, rng),
    movement: grow(p.movement, growth, rng),
    stamina: grow(p.stamina, growth * 0.5, rng),
  };
}

function hands(position: Position, rng: Rng): { bats: BatSide; throws: Hand } {
  const throwsLeft = position !== 'C' && position !== '2B' && position !== '3B' && position !== 'SS' && rng.chance(0.27);
  const throws: Hand = throwsLeft ? 'L' : 'R';
  const bats: BatSide = rng.chance(0.08) ? 'S' : throwsLeft ? (rng.chance(0.9) ? 'L' : 'R') : rng.chance(0.3) ? 'L' : 'R';
  return { bats, throws };
}

export function generatePlayer(spec: PlayerSpec, rng: Rng): Player {
  const { position, talent, age } = spec;
  const pitcher = position === 'SP' || position === 'RP';
  const growth = growthForAge(age, rng);

  const bat = batting(talent, position, rng);
  const pitch = pitcher ? pitching(talent, position === 'SP', rng) : null;

  const defense = pitcher ? clampRating(rng.normal(45, 6)) : clampRating(talent + rng.normal(0, 8));
  const positionRatings: Player['positionRatings'] = {};
  if (!pitcher && position !== 'DH') {
    positionRatings[position] = defense;
    for (const [pos, delta] of SECONDARY[position]) {
      if (rng.chance(0.6)) positionRatings[pos] = clampRating(defense + delta + rng.normal(0, 3));
    }
  }

  return {
    id: spec.id,
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    age,
    ...hands(position, rng),
    position,
    positionRatings,
    batting: bat,
    battingPotential: growBatting(bat, pitcher ? 0 : growth, rng),
    fielding: {
      defense,
      arm: clampRating(rng.normal(position === 'RF' || position === 'C' || position === 'SS' ? 56 : 48, 8)),
    },
    pitching: pitch,
    pitchingPotential: pitch ? growPitching(pitch, growth, rng) : null,
    personality: {
      workEthic: clampRating(rng.normal(50, 10)),
      leadership: clampRating(rng.normal(50 + Math.max(0, age - 28), 10)),
      loyalty: clampRating(rng.normal(50, 10)),
      greed: clampRating(rng.normal(50, 10)),
    },
    injuryProneness: Math.min(1, Math.max(0, rng.normal(0.3, 0.12))),
    teamId: spec.teamId,
    level: spec.level,
    contract: null,
    scoutSeed: rng.nextUint32(),
  };
}

/** Rough salary (in $K) from overall rating and age-driven service level. */
export function estimateSalary(ovr: number, age: number, rng: Rng): number {
  const MIN = 760;
  if (age < 26) return MIN + Math.round(rng.next() * 3) * 10;
  const quality = Math.max(0, (ovr - 40) / 40);
  const raw = MIN + quality ** 2.5 * 60000 * (0.8 + rng.next() * 0.4);
  return Math.round(raw / 10) * 10;
}
