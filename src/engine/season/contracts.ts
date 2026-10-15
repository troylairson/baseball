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

/**
 * Seasons before he can leave as a free agent, counting this one: his
 * contract, or team control (pre-arbitration and arbitration years) if longer.
 */
export function yearsOfControl(p: Player): number {
  const years = p.contract?.years ?? 0;
  if (contractStatus(p) === 'free-agent') return years;
  return Math.max(years, FREE_AGENCY_YEARS - (p.experience ?? 0));
}

/** In the last year before free agency. */
export const headedToFreeAgency = (p: Player) => (p.contract?.years ?? 0) > 0 && yearsOfControl(p) <= 1;

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

/** What a player of this value and age would have signed for (in $K). */
function priceAt(p: Player, war: number, age: number): number {
  const greed = 1 + (p.personality.greed - 50) / 150;
  const ageMul = age <= 30 ? 1 : Math.max(0.45, 1 - (age - 30) * 0.08);
  return marketSalary(war, roleOf(p)) * greed * ageMul;
}

/**
 * A plausible existing contract for a player in a new league, by service
 * time. Pre-arbitration and arbitration players are on one-year deals (team
 * control), unless a young star was locked up early; veterans are partway
 * through a market deal signed some winters ago, at what they were worth then.
 */
export function initialContract(p: Player, rng: { next: () => number; int: (a: number, b: number) => number }): Contract {
  const status = contractStatus(p);
  const exp = p.experience ?? 0;
  const war = expectedWar(p);
  const round = (x: number) => Math.max(MIN_SALARY, Math.round(x / 10) * 10);

  if (status !== 'free-agent') {
    // Clubs buy out arbitration (and a few free-agent years) of their best young players.
    const extend = p.level === 'MLB' && p.age <= 28 && war >= 2.5 && rng.next() < (war >= 4 ? 0.45 : 0.2);
    if (extend) {
      const control = FREE_AGENCY_YEARS - exp;
      const signedAgo = rng.int(0, Math.min(2, exp));
      const length = Math.min(10, control + signedAgo + rng.int(1, 4));
      // Signed before he'd earned it: a discount for the security.
      return { salary: round(priceAt(p, war, p.age) * (0.42 + rng.next() * 0.2)), years: Math.max(2, length - signedAgo) };
    }
    return status === 'pre-arb' ? preArbRenewal(p) : arbitrationAward(p);
  }

  // A free-agent deal signed `ago` winters back, when he was younger and (if past his prime) better.
  const fa = exp - FREE_AGENCY_YEARS;
  let ago = rng.int(0, Math.min(6, fa));
  if (rng.next() < 0.35) ago = 0;
  const thenAge = p.age - ago;
  const thenWar = war + (p.age > 30 ? Math.min(ago, p.age - 30) * 0.4 : 0);
  let length = contractYears(thenWar, thenAge) + (rng.next() < 0.3 ? 1 : 0) - (rng.next() < 0.2 ? 1 : 0);
  if (length <= ago) {
    // That deal would be over: he signed a new one last winter.
    ago = 0;
    length = contractYears(war, p.age);
  }
  const salary = round((ago ? priceAt(p, thenWar, thenAge) : priceAt(p, war, p.age)) * (0.85 + rng.next() * 0.3));
  return { salary, years: Math.max(1, length - ago) };
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
