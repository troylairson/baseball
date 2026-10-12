import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { generateSchedule } from './schedule';
import { Rng } from '../rng';
import { arbitrationAward, contractDemand, contractStatus } from './contracts';
import { ensureCareerDefaults } from './career';
import { advanceOffseason, extendPlayer, expiringFor } from './offseason';
import type { SeasonState } from './season';

function state(seed: number): SeasonState {
  const { league, teams, players } = generateLeague(seed);
  const s: SeasonState = { league, teams, players, schedule: generateSchedule(teams, 162, league.season, new Rng(seed)), stats: new Map(), userTeamId: 0, seed };
  ensureCareerDefaults(s);
  return s;
}

describe('service time and contracts', () => {
  it('classifies players by experience and discounts arbitration', () => {
    const s = state(21);
    const p = s.players.find((x) => x.level === 'MLB' && x.age >= 27)!;
    p.experience = 1;
    expect(contractStatus(p)).toBe('pre-arb');
    p.experience = 4;
    expect(contractStatus(p)).toBe('arbitration');
    expect(arbitrationAward(p).salary).toBeLessThanOrEqual(contractDemand(p).salary);
    p.experience = 7;
    expect(contractStatus(p)).toBe('free-agent');
  });

  it('renews pre-arb players automatically and only asks about arb / FA players', () => {
    const s = state(22);
    const mine = s.players.filter((p) => p.teamId === 0 && p.level === 'MLB');
    const young = mine[0]!;
    const arb = mine[1]!;
    const vet = mine[2]!;
    young.experience = 1;
    arb.experience = 4;
    vet.experience = 8;
    for (const p of [young, arb, vet]) p.contract = { salary: 1000, years: 1 };
    s.league.phase = 'offseason';
    s.league.offseason = 'review';
    advanceOffseason(s);
    // Development may retire the veteran; the others must be decided correctly.
    expect(young.contract?.years).toBe(1);
    const asked = expiringFor(s, 0).map((p) => p.id);
    expect(asked).not.toContain(young.id);
    if (!arb.retired) {
      expect(asked).toContain(arb.id);
      expect(arb.expiring).toBe('arbitration');
      expect(arb.demand?.years).toBe(1);
    }
    if (!vet.retired) expect(vet.expiring).toBe('free-agent');
  });

  it('extends willing players in their final year', () => {
    const s = state(23);
    const p = s.players.find((x) => x.teamId === 0 && x.level === 'MLB')!;
    p.contract = { salary: 2000, years: 1 };
    p.personality.loyalty = 80;
    p.personality.greed = 30;
    expect(extendPlayer(s, p.id).ok).toBe(true);
    expect(p.contract.years).toBeGreaterThan(1);
    const q = s.players.filter((x) => x.teamId === 0 && x.level === 'MLB')[1]!;
    q.contract = { salary: 2000, years: 1 };
    q.personality.loyalty = 20;
    q.personality.greed = 80;
    const res = extendPlayer(s, q.id);
    expect(res.ok).toBe(false);
  });
});
