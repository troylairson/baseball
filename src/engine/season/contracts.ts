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

/** Market price of one win above replacement, in $K (scaled to the game's payrolls). */
export const DOLLARS_PER_WAR = 6500;

/** Wins above replacement a player of this rating produces in a full season in his role. */
export function warForRating(ovr: number, role: 'H' | 'SP' | 'RP'): number {
  if (role === 'SP') return (ovr - 45) * 0.27;
  if (role === 'RP') return (ovr - 47) * 0.11;
  return (ovr - 48) * 0.35;
}

export const roleOf = (p: Pick<Player, 'position'>): 'H' | 'SP' | 'RP' => (p.position === 'SP' ? 'SP' : p.position === 'RP' ? 'RP' : 'H');

/** Expected WAR per season at the player's current rating. */
export function expectedWar(p: Player): number {
  return warForRating(overall(p), roleOf(p));
}

/** What a season of this player is worth on the open market, before personality and age. */
export function marketSalary(war: number, role: 'H' | 'SP' | 'RP'): number {
  // Teams pay relievers a premium for high-leverage innings.
  const price = DOLLARS_PER_WAR * (role === 'RP' ? 1.7 : 1);
  return MIN_SALARY + price * Math.max(0, war) ** 1.05;
}

/** Contract length a player can command: stars in their twenties get long deals. */
export function contractYears(war: number, age: number): number {
  if (war >= 4) return Math.max(1, Math.min(10, 36 - age));
  if (war >= 2.5) return age <= 27 ? 6 : age <= 29 ? 5 : age <= 30 ? 4 : age <= 32 ? 3 : age <= 34 ? 2 : 1;
  if (war >= 1.2) return age <= 29 ? 3 : age <= 32 ? 2 : 1;
  return war > 0.6 && age <= 28 ? 2 : 1;
}

/**
 * What a player asks for on a new deal (in $K / years). Deterministic so the
 * UI can show it without an RNG; greedier players ask for more.
 */
export function contractDemand(p: Player): Contract {
  const war = expectedWar(p);
  const greed = 1 + (p.personality.greed - 50) / 150;
  // Teams pay less for players past their prime.
  const ageMul = p.age <= 30 ? 1 : Math.max(0.45, 1 - (p.age - 30) * 0.08);
  const salary = Math.max(MIN_SALARY, Math.round((marketSalary(war, roleOf(p)) * greed * ageMul) / 10) * 10);
  return { salary, years: contractYears(war, p.age) };
}

/**
 * A plausible existing contract for a player in a new league, by service
 * time: pre-arbitration minimums, arbitration shares, or a market deal
 * signed some years ago with time left on it.
 */
export function initialContract(p: Player, rng: { next: () => number; int: (a: number, b: number) => number }): Contract {
  const status = contractStatus(p);
  if (status === 'pre-arb') return preArbRenewal(p);
  if (status === 'arbitration') return arbitrationAward(p);
  const demand = contractDemand(p);
  const salary = Math.max(MIN_SALARY, Math.round((demand.salary * (0.8 + rng.next() * 0.4)) / 10) * 10);
  return { salary, years: rng.int(1, Math.max(1, Math.min(demand.years, 7))) };
}

/**
 * Will a player sign an extension now? Loyal players on good teams say
 * yes; greedy players on bad teams prefer to test the market.
 */
export function extensionWillingness(p: Player, teamWinPct: number): number {
  const morale = ((p.morale ?? 50) - 50) * 0.5;
  return p.personality.loyalty + (teamWinPct - 0.5) * 60 - (p.personality.greed - 50) * 0.5 + morale;
}

export const EXTENSION_THRESHOLD = 45;

/** Extension terms: market value, with a premium to buy out arbitration years. */
export function extensionTerms(p: Player): Contract {
  const d = contractDemand(p);
  const premium = contractStatus(p) === 'free-agent' ? 1.05 : 0.9;
  return { salary: Math.round((d.salary * premium) / 10) * 10, years: Math.max(2, d.years) };
}
