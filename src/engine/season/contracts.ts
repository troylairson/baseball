import { overall } from '../model/ratings';
import type { Contract, Player } from '../model/types';

export const MIN_SALARY = 760;

/** Service-time thresholds (seasons of MLB experience). */
export const ARB_YEARS = 3;
export const FREE_AGENCY_YEARS = 6;

export type ContractStatus = 'pre-arb' | 'arbitration' | 'free-agent';

/** Where a player stands for his next contract, by service time. */
export function contractStatus(p: Player): ContractStatus {
  const exp = p.experience ?? 0;
  return exp < ARB_YEARS ? 'pre-arb' : exp < FREE_AGENCY_YEARS ? 'arbitration' : 'free-agent';
}

/** One-year arbitration award: a growing share of open-market value. */
export function arbitrationAward(p: Player): Contract {
  const share = [0.45, 0.6, 0.78][Math.min(2, (p.experience ?? ARB_YEARS) - ARB_YEARS)]!;
  return { salary: Math.max(MIN_SALARY, Math.round((contractDemand(p).salary * share) / 10) * 10), years: 1 };
}

/** Renewal for players not yet eligible for arbitration. */
export function preArbRenewal(p: Player): Contract {
  return { salary: MIN_SALARY + (p.experience ?? 0) * 60, years: 1 };
}

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

/**
 * Will a player sign an extension now? Loyal players on good teams say
 * yes; greedy players on bad teams prefer to test the market.
 */
export function extensionWillingness(p: Player, teamWinPct: number): number {
  return p.personality.loyalty + (teamWinPct - 0.5) * 60 - (p.personality.greed - 50) * 0.5;
}

export const EXTENSION_THRESHOLD = 45;

/** Extension terms: market value, with a premium to buy out arbitration years. */
export function extensionTerms(p: Player): Contract {
  const d = contractDemand(p);
  const premium = contractStatus(p) === 'free-agent' ? 1.05 : 0.9;
  return { salary: Math.round((d.salary * premium) / 10) * 10, years: Math.max(2, d.years) };
}
