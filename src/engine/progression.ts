import { clampRating } from './model/ratings';
import type { BattingRatings, PitchingRatings, Player } from './model/types';
import type { Rng } from './rng';

/**
 * Yearly development. Young players grow toward their potential (faster
 * with a strong work ethic), players in their prime hold steady with some
 * noise, and veterans decline — speed first, then everything else.
 */
export function developPlayer(p: Player, rng: Rng): void {
  p.age++;
  const ethic = (p.personality.workEthic - 50) / 50; // -0.6 .. 0.6
  const age = p.age;
  // Share of the gap to potential closed this year.
  const growShare = age <= 21 ? 0.3 : age <= 24 ? 0.35 : age <= 27 ? 0.45 : 0;
  const decline = age >= 31 ? (age - 30) * 0.9 : 0;

  const step = (cur: number, pot: number, declineMul = 1) => {
    if (growShare > 0) {
      const gain = Math.max(0, (pot - cur) * (growShare + ethic * 0.1) + rng.normal(0, 1.5));
      return clampRating(cur + gain);
    }
    return clampRating(cur - decline * declineMul + rng.normal(0, 1.4));
  };

  const b = p.batting;
  const bp = p.battingPotential;
  p.batting = {
    contact: step(b.contact, bp.contact),
    power: step(b.power, bp.power, 1.1),
    eye: step(b.eye, bp.eye, 0.6),
    speed: clampRating(b.speed - (age >= 28 ? 1 + (age - 28) * 0.3 : 0) + rng.normal(0, 1)),
  };
  if (p.pitching && p.pitchingPotential) {
    const c = p.pitching;
    const pp = p.pitchingPotential;
    p.pitching = {
      stuff: step(c.stuff, pp.stuff, 1.2),
      control: step(c.control, pp.control, 0.6),
      movement: step(c.movement, pp.movement),
      stamina: step(c.stamina, pp.stamina, 0.8),
    };
  }
  p.fielding.defense = clampRating(p.fielding.defense - (age >= 30 ? (age - 29) * 0.7 : 0) + rng.normal(0, 1));
  for (const pos of Object.keys(p.positionRatings) as (keyof Player['positionRatings'])[]) {
    p.positionRatings[pos] = clampRating(p.positionRatings[pos]! - (age >= 30 ? (age - 29) * 0.7 : 0) + rng.normal(0, 1));
  }

  // Potential: prospects' ceilings wobble; past 27 the ceiling is what you are.
  p.battingPotential = settlePotential(p.batting, p.battingPotential, age, rng);
  if (p.pitching && p.pitchingPotential) p.pitchingPotential = settlePotential(p.pitching, p.pitchingPotential, age, rng);
}

function settlePotential<T extends BattingRatings | PitchingRatings>(cur: T, pot: T, age: number, rng: Rng): T {
  const out = { ...pot };
  for (const key of Object.keys(cur) as (keyof T)[]) {
    const c = cur[key] as number;
    const p = pot[key] as number;
    (out[key] as number) = age >= 27 ? c : Math.max(c, clampRating(p + rng.normal(0, 2)));
  }
  return out;
}

/** Chance a player hangs it up this offseason. */
export function retirementChance(p: Player, ovr: number, freeAgent: boolean): number {
  const age = p.age;
  let chance = 0;
  if (age >= 40) chance = 0.9;
  else if (age >= 35) chance = 0.15 + (age - 35) * 0.13;
  else if (age >= 32) chance = 0.03;
  if (ovr < 42 && age >= 30) chance += 0.25;
  if (freeAgent && age >= 30) chance += 0.2;
  if (ovr >= 62) chance *= 0.5;
  return Math.min(1, chance);
}
