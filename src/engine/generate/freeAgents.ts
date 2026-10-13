import { contractDemand, MIN_SALARY } from '../season/contracts';
import type { Player, Position } from '../model/types';
import type { Rng } from '../rng';
import { generatePlayer } from './players';

/** Free agents per team the market should hold at the start of a season. */
export const FREE_AGENTS_PER_TEAM = 4;

/** Rough share of each position on the open market. */
const POSITION_MIX: [Position, number][] = [
  ['SP', 20], ['RP', 26], ['C', 7], ['1B', 6], ['2B', 6], ['3B', 6], ['SS', 6], ['LF', 6], ['CF', 6], ['RF', 6], ['DH', 3],
];

/** Who's out there: a few useful veterans, plenty of depth, and some 4-A types. */
const TIERS: { weight: number; talent: [number, number]; age: [number, number] }[] = [
  { weight: 12, talent: [50, 2.5], age: [31, 36] },
  { weight: 48, talent: [45, 2.5], age: [27, 34] },
  { weight: 40, talent: [41, 2.5], age: [25, 31] },
];

/**
 * Top the free agent pool up to a healthy size so there is always someone to
 * sign: veterans released in spring, career minor leaguers, bounce-back arms.
 * Returns the players added.
 */
export function topUpFreeAgents(players: Player[], teamCount: number, rng: Rng): Player[] {
  const pool = players.filter((p) => p.teamId === null && !p.retired && !p.draftProspect);
  const target = teamCount * FREE_AGENTS_PER_TEAM;
  const usedNames = new Set(players.filter((p) => !p.retired).map((p) => `${p.firstName[0]}. ${p.lastName}`));
  let nextId = players.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const added: Player[] = [];
  for (let i = pool.length; i < target; i++) {
    const tier = rng.weighted(TIERS.map((t) => [t, t.weight] as const));
    const position = rng.weighted(POSITION_MIX);
    const age = rng.int(tier.age[0], tier.age[1]);
    const p = generatePlayer(
      { id: nextId++, position, talent: rng.normal(tier.talent[0], tier.talent[1]), age, teamId: null, level: 'MLB' },
      rng,
      usedNames,
    );
    // Veterans have big-league time; the 4-A types mostly don't.
    p.experience = Math.max(0, age - rng.int(23, 27) - (tier === TIERS[2] ? 4 : 0));
    p.demand = contractDemand(p);
    players.push(p);
    added.push(p);
  }
  return added;
}

/** Once the season is near, unsigned players lower their sights to a one-year deal. */
export function softenDemands(players: Player[]): void {
  for (const p of players) {
    if (p.teamId !== null || p.retired || p.draftProspect) continue;
    const ask = p.demand ?? contractDemand(p);
    p.demand = { salary: Math.max(MIN_SALARY, Math.round((ask.salary * 0.6) / 10) * 10), years: 1 };
  }
}
