import { overall } from '../model/ratings';
import type { Contract, Player } from '../model/types';

export const MIN_SALARY = 760;

/**
 * What a player asks for on a new deal (in $K / years). Deterministic so the
 * UI can show it without an RNG; greedier players ask for more.
 */
export function contractDemand(p: Player): Contract {
  const ovr = overall(p);
  const quality = Math.max(0, (ovr - 40) / 40);
  const greed = 1 + (p.personality.greed - 50) / 150;
  // Prime-age players get a premium; old players a discount.
  const ageMul = p.age <= 30 ? 1 : Math.max(0.5, 1 - (p.age - 30) * 0.08);
  const salary = Math.max(MIN_SALARY, Math.round((MIN_SALARY + quality ** 2.5 * 60000 * greed * ageMul) / 10) * 10);
  const years = ovr < 45 ? 1 : p.age <= 27 ? 5 : p.age <= 30 ? 4 : p.age <= 32 ? 3 : p.age <= 34 ? 2 : 1;
  return { salary, years };
}

/** Rough surplus value of a player for trades and roster decisions. */
export function playerValue(p: Player, contending: boolean): number {
  const ovr = overall(p);
  const pot = overall(p, true);
  const ageFactor = p.age <= 24 ? 1 : p.age <= 29 ? 0.9 : Math.max(0.3, 0.9 - (p.age - 29) * 0.12);
  const now = Math.max(0, ovr - 38) ** 1.6;
  const future = Math.max(0, pot - 38) ** 1.6 * (p.age <= 25 ? 0.8 : 0.2);
  const salary = p.contract?.salary ?? MIN_SALARY;
  const fair = contractDemand(p).salary;
  const surplus = ((fair - salary) / 1000) * Math.min(3, p.contract?.years ?? 1) * 0.6;
  return (contending ? now * 1.2 + future * 0.6 : now * 0.7 + future * 1.3) * ageFactor + surplus;
}
