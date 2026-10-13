import { clampRating, overall } from '../model/ratings';
import type { League, Player, Team } from '../model/types';
import { hashString, Rng } from '../rng';
import {
  ARB_YEARS, contractStatus, DOLLARS_PER_WAR, FREE_AGENCY_YEARS, marketSalary, MIN_SALARY, roleOf, warForRating,
} from './contracts';
import { scoutingAccuracy } from './staff';

/**
 * Trade value as surplus: for each season a club controls a player, the
 * wins he's projected to add (at the market price of a win) minus what he'll
 * be paid. Contenders weight this season more, rebuilders the future.
 * Values are in $M; a fairly paid veteran is worth about zero, a cheap young
 * star a lot, and a bad contract is negative.
 */

/** How a club sees a player: current and peak overall. */
export interface RatingView {
  ovr: number;
  pot: number;
}

/** Spread of overall ratings in the league, for shrinking uncertain estimates. */
const SPREAD = 6;

export const trueView = (p: Player): RatingView => ({ ovr: overall(p), pot: overall(p, true) });

/**
 * A club's own read of a player through its scouting department: close for
 * its own players, noisier for everyone else. Noise is stable per club and
 * player, so a club doesn't change its mind every time it looks.
 */
export function teamView(league: League, team: Team, p: Player): RatingView {
  const acc = scoutingAccuracy(league, team);
  const accuracy = p.teamId === team.id ? acc.own : acc.other;
  const rng = new Rng((p.scoutSeed ^ hashString(`club-${team.id}`)) >>> 0);
  const sd = (1 - accuracy) * 5;
  const ovr = overall(p);
  const pot = overall(p, true);
  // A sensible front office discounts what it isn't sure of: estimates are
  // pulled toward a typical player in proportion to the scouting uncertainty.
  const shrink = 1 / (1 + (sd / SPREAD) ** 2);
  const typical = p.level === 'MLB' ? 49 : 43;
  const seen = typical + (ovr + rng.normal(0, sd) - typical) * shrink;
  // Scouts misjudge remaining growth more than current ability.
  const growth = Math.max(0, (pot - ovr + rng.normal(0, sd * 1.2)) * shrink);
  return { ovr: seen, pot: seen + growth };
}

/** Projected overall `years` seasons from now, with growth toward peak and aging after 30. */
export function projectedOverall(view: RatingView, age: number, years: number): number {
  let v = view.ovr;
  for (let y = 1; y <= years; y++) {
    const a = age + y;
    if (a <= 27) v += Math.max(0, view.pot - v) * (a <= 24 ? 0.32 : 0.42);
    else if (a >= 30) v -= (a - 29) * 0.9;
  }
  return clampRating(v);
}

/** Seasons the current club controls him, including this one. */
export function controlYears(p: Player): number {
  const contract = Math.max(1, p.contract?.years ?? 1);
  if (contractStatus(p) === 'free-agent') return contract;
  return Math.min(7, Math.max(contract, FREE_AGENCY_YEARS - (p.experience ?? 0)));
}

/** Expected salary in a future season of control. */
function salaryIn(p: Player, year: number, war: number): number {
  const contract = p.contract;
  if (contract && year < Math.max(1, contract.years)) return contract.salary;
  const service = (p.experience ?? 0) + year;
  if (service < ARB_YEARS) return MIN_SALARY + service * 60;
  const share = [0.45, 0.6, 0.78][Math.min(2, service - ARB_YEARS)]!;
  return Math.max(MIN_SALARY, marketSalary(war, roleOf(p)) * share);
}

const DISCOUNT = 0.9;

/** Relievers' wins come in high-leverage spots, and the market pays accordingly. */
export const pricePerWar = (role: 'H' | 'SP' | 'RP') => DOLLARS_PER_WAR * (role === 'RP' ? 1.7 : 1);

/** Surplus value in $M of controlling this player, as a contender or rebuilder sees it. */
export function playerValue(p: Player, contending: boolean, view: RatingView = trueView(p)): number {
  const years = controlYears(p);
  const role = roleOf(p);
  // Minor leaguers may never stick; prospects with a lot of projection carry more bust risk.
  const risk = p.level !== 'AAA' ? 1 : view.pot > view.ovr + 3 ? 0.6 : 0.75;
  let value = 0;
  for (let y = 0; y < years; y++) {
    const ovr = projectedOverall(view, p.age, y);
    // Below-replacement players sit on the bench rather than costing wins,
    // and fringe players are part-timers: they don't get a regular's playing time.
    const full = Math.max(0, warForRating(ovr, role));
    const war = full * Math.min(1, 0.35 + full / 3);
    // A minor leaguer contributes nothing this season.
    const playing = y === 0 && p.level === 'AAA' ? 0.2 : 1;
    const weight = contending ? (y === 0 ? 1.35 : 0.95) : y === 0 ? 0.55 : y === 1 ? 0.85 : 1.1;
    const surplus = war * playing * pricePerWar(role) * (y > 0 ? risk : 1) - salaryIn(p, y, war);
    value += surplus * weight * DISCOUNT ** y;
  }
  return value / 1000;
}
