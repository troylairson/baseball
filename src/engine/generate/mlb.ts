import { clampRating } from '../model/ratings';
import type { BattingRatings, FieldPosition, PitchingRatings, Position } from '../model/types';
import { FIELD_POSITIONS } from '../model/types';
import { hashString, Rng } from '../rng';
import { LEAGUE } from '../sim/pa';
import { ARB_YEARS, FREE_AGENCY_YEARS, MIN_SALARY } from '../season/contracts';
import { growBatting, growPitching, growthForAge } from './players';
import type { RosterFile, RosterPlayer } from './rosterFile';

/** Raw data produced by scripts/mlb-pack.mjs from the MLB Stats API. */
export interface MlbPack {
  format: 'mlb-stats-pack';
  version: 1;
  season: number;
  fetched: string;
  teams: {
    key: string; city: string; name: string; abbr: string; colors: [string, string]; market: number;
    conference: string; conferenceAbbr: string; division: string;
  }[];
  players: MlbPackPlayer[];
}

type Level = 'MLB' | 'AAA' | 'AA';

export interface MlbBatLine { y: number; l: Level; pa: number; ab: number; h: number; d: number; t: number; hr: number; bb: number; so: number; hbp: number; sb: number; cs: number; sf: number }
export interface MlbPitLine { y: number; l: Level; g: number; gs: number; bf: number; o: number; h: number; er: number; bb: number; so: number; hr: number; hbp: number; sv: number }

export interface MlbPackPlayer {
  id: number;
  first: string;
  last: string;
  born: string;
  bats: string;
  throws: string;
  pos: string;
  team: string;
  /** 40-man status code: A active, D60 60-day IL, etc. */
  status: string;
  debut: string | null;
  bat: MlbBatLine[];
  pit: MlbPitLine[];
  /** Weighted games by fielding position. */
  fld: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Converting stat lines into the engine's 20–80 ratings.
//
// The sim's plate-appearance model (sim/pa.ts) maps ratings to rates with
// rate = league * exp(k * (rating - 50) / 10). Here we run that backwards:
// weight recent seasons more, translate minor league numbers to MLB terms,
// regress small samples toward a fringe-big-leaguer prior, then solve for the
// rating that would produce the observed rate against an average opponent.

/** Minor league equivalency: multiply rates to estimate MLB performance. */
const TRANSLATE: Record<Level, { k: number; bb: number; hr: number; babip: number; weight: number }> = {
  MLB: { k: 1, bb: 1, hr: 1, babip: 0, weight: 1 },
  AAA: { k: 1.12, bb: 0.9, hr: 0.78, babip: -0.022, weight: 0.65 },
  AA: { k: 1.2, bb: 0.85, hr: 0.68, babip: -0.032, weight: 0.45 },
};

/** Recency weights by seasons ago. */
const RECENCY = [5, 4, 3, 2];

/** League-average rates the inversion is centered on (computed from the pack's MLB lines). */
export interface Baselines {
  k: number; bb: number; hr: number; babip: number; sb: number; triple: number;
  pk: number; pbb: number; phr: number;
}

/** Recency-weighted MLB rates across everyone in the pack. */
export function packBaselines(pack: MlbPack): Baselines {
  const sum = { pa: 0, so: 0, bb: 0, hr: 0, h: 0, bip: 0, sbAtt: 0, onFirst: 0, t: 0, bf: 0, pso: 0, pbb: 0, phr: 0 };
  for (const p of pack.players) {
    for (const l of p.bat) {
      const ago = pack.season - l.y;
      if (l.l !== 'MLB' || ago < 0 || ago >= RECENCY.length) continue;
      const w = RECENCY[ago]!;
      sum.pa += l.pa * w; sum.so += l.so * w; sum.bb += l.bb * w; sum.hr += l.hr * w;
      sum.h += (l.h - l.hr) * w; sum.bip += Math.max(0, l.ab - l.so - l.hr + l.sf) * w; sum.t += l.t * w;
      sum.sbAtt += (l.sb + l.cs) * w; sum.onFirst += Math.max(0, l.h - l.d - l.t - l.hr + l.bb + l.hbp) * w;
    }
    for (const l of p.pit) {
      const ago = pack.season - l.y;
      if (l.l !== 'MLB' || ago < 0 || ago >= RECENCY.length) continue;
      const w = RECENCY[ago]!;
      sum.bf += l.bf * w; sum.pso += l.so * w; sum.pbb += l.bb * w; sum.phr += l.hr * w;
    }
  }
  if (!sum.pa || !sum.bf) return { k: LEAGUE.k, bb: LEAGUE.bb, hr: LEAGUE.hr, babip: LEAGUE.babip, sb: 0.07, triple: 0.006, pk: LEAGUE.k, pbb: LEAGUE.bb, phr: LEAGUE.hr };
  return {
    k: sum.so / sum.pa, bb: sum.bb / sum.pa, hr: sum.hr / sum.pa, babip: sum.h / sum.bip,
    sb: sum.sbAtt / sum.onFirst, triple: sum.t / sum.bip,
    pk: sum.pso / sum.bf, pbb: sum.pbb / sum.bf, phr: sum.phr / sum.bf,
  };
}

/** Rating a small sample is pulled toward: a fringe major leaguer. */
const PRIOR = 45;
/** Hitters with little big league time are mostly bench and depth bats. */
const HITTER_PRIOR = 41;

const lnRatio = (x: number, base: number) => Math.log(Math.max(1e-4, x) / base);
const rateAt = (k: number, rating: number) => Math.exp((k * (rating - 50)) / 10);

interface Weighted { n: number; [key: string]: number }

function accumulate<T extends { y: number; l: Level }>(lines: T[], season: number, size: (l: T) => number, rates: (l: T) => Record<string, number>): Weighted {
  const out: Weighted = { n: 0 };
  for (const line of lines) {
    const ago = season - line.y;
    if (ago < 0 || ago >= RECENCY.length) continue;
    const w = RECENCY[ago]! / RECENCY[0]! * TRANSLATE[line.l].weight;
    const n = size(line) * w;
    if (n <= 0) continue;
    out.n += n;
    for (const [k, v] of Object.entries(rates(line))) out[k] = (out[k] ?? 0) + v * n;
  }
  for (const k of Object.keys(out)) if (k !== 'n' && out.n > 0) out[k]! /= out.n;
  return out;
}

/** Shrink an observed rate toward the prior by `stabilize` plate appearances. */
const regress = (rate: number | undefined, n: number, prior: number, stabilize: number) =>
  ((rate ?? prior) * n + prior * stabilize) / (n + stabilize);

export function hitterRatings(p: MlbPackPlayer, season: number, lg: Baselines): { batting: BattingRatings; sample: number } {
  const w = accumulate(p.bat, season, (l) => l.pa, (l) => {
    const t = TRANSLATE[l.l];
    const bip = Math.max(1, l.ab - l.so - l.hr + l.sf);
    const singlesWalks = Math.max(1, l.h - l.d - l.t - l.hr + l.bb + l.hbp);
    return {
      k: (l.so / l.pa) * t.k,
      bb: (l.bb / l.pa) * t.bb,
      hr: (l.hr / l.pa) * t.hr,
      babip: (l.h - l.hr) / bip + t.babip,
      sb: (l.sb + l.cs) / singlesWalks,
      triple: l.t / bip,
    };
  });
  const n = w.n;
  const kPrior = lg.k * rateAt(-0.3, HITTER_PRIOR);
  const bbPrior = lg.bb * rateAt(0.32, HITTER_PRIOR);
  const hrPrior = lg.hr * rateAt(0.33, HITTER_PRIOR);
  const k = regress(w.k, n, kPrior, 100);
  const bb = regress(w.bb, n, bbPrior, 140);
  const hr = regress(w.hr, n, hrPrior, 220);
  const babip = regress(w.babip, n, lg.babip - 0.012, 700);
  const sb = regress(w.sb, n, lg.sb * 0.9, 250);
  const triple = regress(w.triple, n, lg.triple, 600);

  const eye = 50 + (10 * lnRatio(bb, lg.bb)) / 0.32;
  const power = 50 + (10 * lnRatio(hr, lg.hr)) / 0.33;
  const speed = 50 + 9 * lnRatio(sb, lg.sb) + 3 * lnRatio(triple, lg.triple);
  // K% is driven mostly by contact (and a little by eye); BABIP adds a noisier read.
  const contactK = 50 - (lnRatio(k, lg.k) + 0.006 * (eye - 50)) / 0.03;
  const contactBabip = 50 + (babip - lg.babip - 0.0006 * (speed - 50)) / 0.0018;
  const contact = contactK * 0.75 + contactBabip * 0.25;
  return {
    batting: { contact: clampRating(contact), power: clampRating(power), eye: clampRating(eye), speed: clampRating(speed) },
    sample: n,
  };
}

export function pitcherRatings(p: MlbPackPlayer, season: number, lg: Baselines): { pitching: PitchingRatings; starter: boolean; sample: number } {
  const w = accumulate(p.pit, season, (l) => l.bf, (l) => {
    const t = TRANSLATE[l.l];
    return {
      k: (l.so / l.bf) * t.k,
      bb: (l.bb / l.bf) * t.bb,
      hr: (l.hr / l.bf) * t.hr,
      startShare: l.g ? l.gs / l.g : 0,
      outsPerStart: l.gs ? Math.min(21, l.o / Math.max(1, l.gs)) : 0,
      outsPerGame: l.g ? l.o / l.g : 0,
    };
  });
  const n = w.n;
  const kPrior = lg.pk * rateAt(0.22, PRIOR);
  const bbPrior = lg.pbb * rateAt(-0.25, PRIOR);
  const hrPrior = lg.phr * rateAt(-0.22, PRIOR);
  const k = regress(w.k, n, kPrior, 120);
  const bb = regress(w.bb, n, bbPrior, 170);
  const hr = regress(w.hr, n, hrPrior, 500);

  const control = 50 - (10 * lnRatio(bb, lg.pbb)) / 0.25;
  // Stuff drives strikeouts; movement suppresses homers. Each nudges the other, so iterate.
  let stuff = 50 + (10 * lnRatio(k, lg.pk)) / 0.22;
  let movement = 50;
  for (let i = 0; i < 4; i++) {
    movement = 50 - (lnRatio(hr, lg.phr) + 0.006 * (stuff - 50)) / 0.022;
    stuff = 50 + (lnRatio(k, lg.pk) - 0.003 * (movement - 50)) / 0.022;
  }
  // The pack's position code is just "P": decide the role from usage.
  const starter = (w.startShare ?? 0) >= 0.5 || (n === 0 && hashString(String(p.id)) % 3 === 0);
  const stamina = starter
    ? 62 + ((w.outsPerStart || 15.5) - 16) * 2.6
    : 35 + ((w.outsPerGame || 3) - 3) * 4;
  return {
    pitching: {
      stuff: clampRating(stuff),
      control: clampRating(control),
      movement: clampRating(movement),
      stamina: clampRating(starter ? Math.max(48, stamina) : Math.min(50, stamina)),
    },
    starter,
    sample: n,
  };
}

/** Defensive positions from where he has actually played, best fit first. */
function positionsFor(p: MlbPackPlayer): FieldPosition[] {
  const games = Object.entries(p.fld)
    .filter(([pos]) => FIELD_POSITIONS.includes(pos as FieldPosition))
    .sort((a, b) => b[1] - a[1]);
  const total = games.reduce((s, [, g]) => s + g, 0);
  const listed = p.pos === 'OF' ? 'CF' : p.pos;
  const out = games.filter(([, g]) => g >= total * 0.12).map(([pos]) => pos as FieldPosition);
  if (!out.length && FIELD_POSITIONS.includes(listed as FieldPosition)) out.push(listed as FieldPosition);
  return out;
}

/** Defensive spectrum: higher is harder. */
const SPECTRUM: Record<FieldPosition, number> = { C: 9, SS: 8, CF: 7, '2B': 6, '3B': 5, RF: 4, LF: 3, '1B': 1 };

/** Rating change moving from a primary position to another one he has played. */
function shiftTo(from: FieldPosition, to: FieldPosition): number {
  if (to === 'C') return -12;
  const step = SPECTRUM[to] - SPECTRUM[from];
  return step > 0 ? -2 - step * 1.6 : Math.min(2, -step * 0.4) - 1;
}

const OUTFIELD: FieldPosition[] = ['CF', 'RF', 'LF'];
const INFIELD: FieldPosition[] = ['SS', '2B', '3B', '1B'];

function easierSpots(primary: FieldPosition): FieldPosition[] {
  if (primary === 'C') return ['1B'];
  const group = OUTFIELD.includes(primary) ? [...OUTFIELD, '1B' as const] : INFIELD;
  return group.filter((pos) => pos !== primary && SPECTRUM[pos] <= SPECTRUM[primary]);
}

/** Defense has no public metric in the feed: start from the position and age, and vary per player. */
function defenseFor(pos: FieldPosition, age: number, rng: Rng): number {
  const premium = pos === 'SS' || pos === 'CF' || pos === 'C' ? 2 : pos === '1B' ? -2 : 0;
  return clampRating(51 + premium - Math.max(0, age - 30) * 0.7 + rng.normal(0, 4));
}

function ageOn(born: string, season: number): number {
  const [y, m] = born.split('-').map(Number);
  return season - y! - (m! > 6 ? 1 : 0);
}

/** Service time, salary and years remaining from career length (the feed has no contracts). */
function contractFor(experience: number, ovr: number, age: number, rng: Rng): RosterPlayer['contract'] {
  if (experience < ARB_YEARS) return { salary: MIN_SALARY + experience * 60, years: 1 };
  const quality = Math.max(0, (ovr - 40) / 40);
  const market = MIN_SALARY + quality ** 2.5 * 60000 * (0.85 + rng.next() * 0.3);
  if (experience < FREE_AGENCY_YEARS) {
    const share = [0.45, 0.6, 0.78][Math.min(2, experience - ARB_YEARS)]!;
    return { salary: Math.max(MIN_SALARY, Math.round((market * share) / 10) * 10), years: 1 };
  }
  return { salary: Math.max(MIN_SALARY, Math.round(market / 10) * 10), years: rng.int(1, Math.max(1, Math.min(6, 36 - age))) };
}

/**
 * Regression squeezes ratings toward the middle. Stretch the ones the sim is
 * most sensitive to back to the spread of a generated league, keeping each
 * player's rank and the league average.
 */
const TARGET_SD: Partial<Record<keyof BattingRatings, number>> = { speed: 11, contact: 8.5 };

const TARGET_PITCH_SD: Partial<Record<keyof PitchingRatings, number>> = { stuff: 8 };

function spreadToScale(players: RosterPlayer[]): void {
  const arms = players.filter((p) => p.pitching && p.level === 'MLB');
  for (const [key, target] of Object.entries(TARGET_PITCH_SD) as [keyof PitchingRatings, number][]) {
    const xs = arms.map((p) => p.pitching![key]);
    const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length);
    if (!sd || sd >= target) continue;
    const k = target / sd;
    for (const p of players) {
      if (!p.pitching) continue;
      const stretch = (v: number) => clampRating(mu + (v - mu) * k);
      p.pitchingPotential = { ...p.pitchingPotential!, [key]: stretch(p.pitchingPotential![key]) };
      p.pitching = { ...p.pitching, [key]: stretch(p.pitching[key]) };
    }
  }
  const hitters = players.filter((p) => !p.pitching && p.level === 'MLB');
  for (const [key, target] of Object.entries(TARGET_SD) as [keyof BattingRatings, number][]) {
    const xs = hitters.map((p) => p.batting[key]);
    const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length);
    if (!sd || sd >= target) continue;
    const k = target / sd;
    for (const p of players) {
      if (p.pitching) continue;
      const stretch = (v: number) => clampRating(mu + (v - mu) * k);
      p.battingPotential = { ...p.battingPotential!, [key]: stretch(p.battingPotential![key]) };
      p.batting = { ...p.batting, [key]: stretch(p.batting[key]) };
    }
  }
}

/** Convert the bundled MLB pack into a roster file. */
export function mlbPackToRoster(pack: MlbPack): RosterFile {
  const confAbbrs = [...new Set(pack.teams.map((t) => t.conferenceAbbr))].sort();
  const conferences = confAbbrs.map((abbr) => ({ abbr, name: pack.teams.find((t) => t.conferenceAbbr === abbr)!.conference }));
  const divisionKeys: string[] = [];
  for (const abbr of confAbbrs) {
    for (const name of ['East', 'Central', 'West']) {
      if (pack.teams.some((t) => t.conferenceAbbr === abbr && t.division === name)) divisionKeys.push(`${abbr} ${name}`);
    }
  }
  const divisions = divisionKeys.map((key) => ({ name: key, conference: confAbbrs.indexOf(key.split(' ')[0]!) }));
  const teams = pack.teams.map((t) => ({
    key: t.key, city: t.city, name: t.name, abbr: t.abbr, primaryColor: t.colors[0], secondaryColor: t.colors[1], market: t.market,
    division: divisionKeys.indexOf(`${t.conferenceAbbr} ${t.division}`),
  }));

  const start = pack.season + 1;
  const lg = packBaselines(pack);
  const players: RosterPlayer[] = pack.players.map((p) => {
    const rng = new Rng(`mlb-${p.id}`);
    const age = ageOn(p.born, start);
    const batSample = p.bat.reduce((s, l) => s + l.pa, 0);
    const pitSample = p.pit.reduce((s, l) => s + l.bf, 0);
    // Two-way players are modeled on their bigger role.
    const pitcher = p.pos === 'P' || (p.pos === 'TWP' && pitSample > batSample * 1.5);
    const { batting } = pitcher
      ? { batting: { contact: clampRating(rng.normal(25, 4)), power: clampRating(rng.normal(25, 5)), eye: clampRating(rng.normal(26, 4)), speed: clampRating(rng.normal(40, 7)) } }
      : hitterRatings(p, pack.season, lg);
    let position: Position;
    let positionRatings: RosterPlayer['positionRatings'] = {};
    let pitching: PitchingRatings | null = null;
    let defense: number;
    if (pitcher) {
      const r = pitcherRatings(p, pack.season, lg);
      pitching = r.pitching;
      position = r.starter ? 'SP' : 'RP';
      defense = clampRating(rng.normal(45, 6));
    } else {
      const spots = positionsFor(p);
      position = spots[0] ?? 'DH';
      defense = position === 'DH' ? clampRating(rng.normal(40, 5)) : defenseFor(position, age, rng);
      positionRatings = Object.fromEntries(spots.map((pos, i) => [pos, i === 0 ? defense : clampRating(defense + shiftTo(position as FieldPosition, pos) + rng.normal(0, 2.5))]));
      // He can also handle the easier spots in his group, as generated players can.
      if (position !== 'DH') {
        for (const pos of easierSpots(position as FieldPosition)) {
          positionRatings[pos] ??= clampRating(defense + shiftTo(position as FieldPosition, pos) - 1);
        }
      }
      if (position === 'DH') positionRatings = { '1B': clampRating(defense) };
    }
    // Young players still have growth in them.
    const growth = growthForAge(age, rng);
    const debutYear = p.debut ? Number(p.debut.slice(0, 4)) : null;
    // Completed big league seasons; a late-season debut doesn't count as a full year.
    const lateDebut = p.debut ? Number(p.debut.slice(5, 7)) >= 8 : false;
    const experience = debutYear ? Math.max(0, Math.min(15, start - debutYear - (lateDebut ? 1 : 0))) : 0;
    const ovrGuess = pitching ? (pitching.stuff * 0.4 + pitching.control * 0.3 + pitching.movement * 0.3) : (batting.contact * 0.35 + batting.power * 0.3 + batting.eye * 0.25 + batting.speed * 0.1);
    return {
      firstName: p.first,
      lastName: p.last,
      age,
      bats: p.bats === 'L' || p.bats === 'S' ? p.bats : 'R',
      throws: p.throws === 'L' ? 'L' : 'R',
      position,
      team: p.team,
      // Players without real big league time start in AAA; the roster logic sorts out the rest.
      level: p.debut ? 'MLB' : 'AAA',
      positionRatings,
      batting,
      battingPotential: growBatting(batting, pitcher ? 0 : growth, rng),
      fielding: { defense, arm: clampRating(rng.normal(position === 'RF' || position === 'C' || position === 'SS' ? 56 : 48, 8)) },
      pitching,
      pitchingPotential: pitching ? growPitching(pitching, growth, rng) : null,
      injuryProneness: Math.min(1, Math.max(0, rng.normal(p.status === 'D60' ? 0.45 : 0.3, 0.12))),
      contract: contractFor(experience, ovrGuess, age, rng),
      experience,
    };
  });

  spreadToScale(players);

  return {
    format: 'diamond-gm-roster',
    version: 1,
    name: `MLB ${pack.season}`,
    season: pack.season,
    conferences,
    divisions,
    teams,
    players,
  };
}
