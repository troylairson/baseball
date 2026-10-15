import { hashString, Rng } from '../rng';
import { clampRating } from './ratings';
import type { Hand, PitchingRatings, Player, Rating } from './types';

/**
 * Pitch repertoires. Ratings (stuff, control, movement) stay the source of
 * truth for how good a pitcher is; each pitch's grade is built from them
 * plus that pitch's own quality, so pitches improve as the pitcher develops.
 * The mix gives a pitcher his shape: ground balls or fly balls, platoon
 * splits, how well he holds up the third time through the order.
 */

export type PitchType = 'FF' | 'SI' | 'FC' | 'SL' | 'SW' | 'CU' | 'CH' | 'FS' | 'KN';

export interface ArsenalPitch {
  type: PitchType;
  /** Quality relative to the pitcher's ratings, about -12..+12. */
  q: number;
  /** Share of pitches thrown, 0–1; a pitcher's usages sum to 1. */
  usage: number;
}

export interface Arsenal {
  /** Fastball velocity relative to what his stuff suggests (mph). */
  velo: number;
  pitches: ArsenalPitch[];
}

export const PITCH_NAMES: Record<PitchType, string> = {
  FF: 'Four-seam fastball', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', SW: 'Sweeper',
  CU: 'Curveball', CH: 'Changeup', FS: 'Splitter', KN: 'Knuckleball',
};

/** Short, lower-case names for play-by-play ("strikes out on a slider"). */
export const PITCH_WORDS: Record<PitchType, string> = {
  FF: 'fastball', SI: 'sinker', FC: 'cutter', SL: 'slider', SW: 'sweeper',
  CU: 'curveball', CH: 'changeup', FS: 'splitter', KN: 'knuckleball',
};

export type PitchFamily = 'fastball' | 'breaking' | 'offspeed';

export const FAMILY: Record<PitchType, PitchFamily> = {
  FF: 'fastball', SI: 'fastball', FC: 'fastball',
  SL: 'breaking', SW: 'breaking', CU: 'breaking',
  CH: 'offspeed', FS: 'offspeed', KN: 'offspeed',
};

/** Ground-ball lean of each pitch (positive: more grounders, fewer homers). */
const GB: Record<PitchType, number> = { FF: -0.8, SI: 1.2, FC: 0.2, SL: 0, SW: -0.2, CU: 0.3, CH: 0.5, FS: 0.9, KN: 0.2 };

/** Speed below the fastball (mph). */
const VELO_GAP: Record<PitchType, number> = { FF: 0, SI: 0.8, FC: 4.5, SL: 8, SW: 11, CU: 13, CH: 8.5, FS: 7.5, KN: 0 };

/** The grade a pitch would have with average quality, from the pitcher's ratings. */
function baseGrade(type: PitchType, r: PitchingRatings): number {
  switch (FAMILY[type]) {
    case 'fastball':
      return type === 'FF' ? r.stuff * 0.8 + r.control * 0.2 : r.stuff * 0.5 + r.movement * 0.5;
    case 'breaking':
      return r.stuff * 0.6 + r.movement * 0.4;
    default:
      return type === 'KN' ? r.movement : r.movement * 0.6 + r.control * 0.4;
  }
}

/** A pitch's 20–80 grade given current (or potential) ratings. */
export function pitchGrade(p: ArsenalPitch, r: PitchingRatings): Rating {
  return clampRating(baseGrade(p.type, r) + p.q);
}

/** Fastball velocity in mph. */
export function fastballVelo(arsenal: Arsenal, r: PitchingRatings): number {
  if (arsenal.pitches[0]?.type === 'KN') return 76 + arsenal.velo * 0.3;
  return 93.6 + (r.stuff - 50) * 0.2 + arsenal.velo;
}

export function pitchVelo(type: PitchType, arsenal: Arsenal, r: PitchingRatings): number {
  return type === 'KN' ? 76 + arsenal.velo * 0.3 : fastballVelo(arsenal, r) - VELO_GAP[type];
}

// ---------------------------------------------------------------------------
// Generation

/** A stable arsenal for a pitcher who doesn't have one yet (new, imported or from an old save). */
export function generateArsenal(p: Pick<Player, 'id' | 'scoutSeed' | 'position' | 'throws'> & { pitching: PitchingRatings | null }): Arsenal {
  const rng = new Rng((p.scoutSeed ^ hashString(`arsenal-${p.id}`)) >>> 0);
  const r = p.pitching!;
  const starter = p.position === 'SP';

  // A rare knuckleballer: soft, but the pitch does all the work.
  if (rng.chance(0.004) && r.movement >= 50) {
    return { velo: rng.normal(0, 2), pitches: [{ type: 'KN', q: rng.normal(4, 3), usage: 0.85 }, { type: 'FF', q: -6, usage: 0.15 }] };
  }

  // Primary fastball: sinkerballers lean on movement, four-seamers on stuff.
  const sinker = rng.chance(0.3 + (r.movement - r.stuff) * 0.015);
  const pitches: ArsenalPitch[] = [{ type: sinker ? 'SI' : 'FF', q: rng.normal(0, 4), usage: 0 }];
  if (sinker && rng.chance(0.45)) pitches.push({ type: 'FF', q: rng.normal(-2, 4), usage: 0 });
  if (rng.chance(starter ? 0.3 : 0.25)) pitches.push({ type: 'FC', q: rng.normal(0, 4), usage: 0 });

  // Breaking balls: almost everyone has one.
  const breaking: PitchType = rng.weighted([['SL', 55], ['SW', 15], ['CU', 30]] as const);
  pitches.push({ type: breaking, q: rng.normal(1, 5), usage: 0 });
  if (starter ? rng.chance(0.45) : rng.chance(0.15)) {
    const second: PitchType = breaking === 'CU' ? rng.weighted([['SL', 70], ['SW', 30]] as const) : 'CU';
    pitches.push({ type: second, q: rng.normal(-1, 5), usage: 0 });
  }

  // Off-speed: starters need something for opposite-handed hitters.
  if (rng.chance(starter ? 0.85 : 0.4)) {
    pitches.push({ type: rng.chance(0.78) ? 'CH' : 'FS', q: rng.normal(0, 5), usage: 0 });
  }

  // Relievers keep it short: two or three pitches.
  const max = starter ? 5 : 3;
  const kept = pitches.slice(0, 1).concat(rng.shuffle(pitches.slice(1)).slice(0, max - 1));
  // Starters always carry at least three.
  if (starter && kept.length < 3) kept.push({ type: kept.some((x) => x.type === 'CH') ? 'CU' : 'CH', q: rng.normal(-2, 4), usage: 0 });
  return { velo: rng.normal(0, 1.4), pitches: assignUsage(kept, r, rng) };
}

/** Usage leans toward the fastball and toward a pitcher's better pitches. */
function assignUsage(pitches: ArsenalPitch[], r: PitchingRatings, rng: Rng): ArsenalPitch[] {
  const weight = (x: ArsenalPitch, i: number) => {
    const base = FAMILY[x.type] === 'fastball' ? (i === 0 ? 2.2 : 1.1) : 1;
    return base * Math.exp((pitchGrade(x, r) - 50) / 25) * (0.85 + rng.next() * 0.3);
  };
  const w = pitches.map(weight);
  // Even the hardest throwers mix it up: the main fastball tops out near 60% (knuckleballers aside).
  if (pitches[0]?.type !== 'KN' && pitches.length > 1) {
    const rest = w.slice(1).reduce((s, x) => s + x, 0);
    w[0] = Math.min(w[0]!, rest * 1.5);
  }
  const total = w.reduce((s, x) => s + x, 0);
  const order = FAMILY_ORDER;
  return pitches
    .map((x, i) => ({ type: x.type, q: Math.round(x.q * 10) / 10, usage: Math.round((w[i]! / total) * 100) / 100 }))
    .sort((a, b) => order[FAMILY[a.type]] - order[FAMILY[b.type]] || b.usage - a.usage);
}

const FAMILY_ORDER: Record<PitchFamily, number> = { fastball: 0, breaking: 1, offspeed: 2 };

/** The pitcher's arsenal, creating it the first time it's needed. */
export function arsenalOf(p: Player): Arsenal | null {
  if (!p.pitching) return null;
  return (p.arsenal ??= generateArsenal(p));
}

/** Offseason: young pitchers sometimes add a pitch, and each pitch's quality drifts a little. */
export function developArsenal(p: Player, rng: Rng): PitchType | null {
  const a = arsenalOf(p);
  if (!a || !p.pitching) return null;
  const young = p.age <= 27;
  for (const x of a.pitches) x.q = Math.round(Math.max(-14, Math.min(14, x.q + rng.normal(young ? 0.4 : -0.1, 1.2))) * 10) / 10;
  const room = (p.position === 'SP' ? 5 : 3) - a.pitches.length;
  if (room <= 0 || !young || !rng.chance(p.position === 'SP' ? 0.1 : 0.06)) return null;
  const have = new Set(a.pitches.map((x) => x.type));
  const options = (['FC', 'SL', 'CU', 'CH', 'FS', 'SW'] as const).filter((t) => !have.has(t));
  if (!options.length) return null;
  const type = rng.pick(options);
  a.pitches = assignUsage([...a.pitches, { type, q: rng.normal(-3, 3), usage: 0 }], p.pitching, rng);
  return type;
}

// ---------------------------------------------------------------------------
// What the mix does in the sim

export interface MixTraits {
  /** Ground-ball lean, centred on a typical pitcher (0). */
  gb: number;
  /** Quality of his weapons against opposite-handed hitters (changeups, splitters), centred. */
  offspeed: number;
  /** Quality of his same-side weapons (sliders, sweepers, cutters), centred. */
  breaking: number;
  /** Share of breaking balls thrown, centred. */
  breakingShare: number;
  /** Fastball velocity above league average (mph). */
  velo: number;
  /** Usable pitches (grade 40+, thrown at least 8% of the time). */
  depth: number;
}

/** League-typical values, measured over generated pitching staffs; keeps every effect centred. */
const AVG = { gb: -0.045, offspeed: 0.12, breaking: 0.265, breakingShare: 0.3 };

export function mixTraits(a: Arsenal, r: PitchingRatings): MixTraits {
  let gb = 0;
  let offspeed = 0;
  let breaking = 0;
  let breakingShare = 0;
  let depth = 0;
  for (const x of a.pitches) {
    // A pitch's shape counts, not the pitcher's overall talent (his ratings already carry that).
    const g = x.q / 10;
    gb += x.usage * GB[x.type];
    if (x.type === 'CH' || x.type === 'FS') offspeed += x.usage * (1 + g);
    if (x.type === 'SL' || x.type === 'SW' || x.type === 'FC') breaking += x.usage * (1 + g);
    if (FAMILY[x.type] === 'breaking') breakingShare += x.usage;
    if (pitchGrade(x, r) >= 40 && x.usage >= 0.08) depth++;
  }
  return {
    gb: gb - AVG.gb,
    offspeed: offspeed - AVG.offspeed,
    breaking: breaking - AVG.breaking,
    breakingShare: breakingShare - AVG.breakingShare,
    velo: fastballVelo(a, r) - 93.6,
    depth,
  };
}

/** Pick the pitch thrown (cosmetic), leaning on his best pitch with two strikes. */
export function choosePitch(a: Arsenal, rng: Rng, putAway: boolean, batterHand: Hand | 'S', throws: Hand): PitchType {
  const sameSide = batterHand === throws;
  const weights = a.pitches.map((x) => {
    let w = x.usage;
    if (putAway && FAMILY[x.type] !== 'fastball') w *= 1.6;
    if (sameSide && (x.type === 'SL' || x.type === 'SW')) w *= 1.3;
    if (!sameSide && (x.type === 'CH' || x.type === 'FS')) w *= 1.4;
    return [x.type, w] as const;
  });
  return rng.weighted(weights);
}
