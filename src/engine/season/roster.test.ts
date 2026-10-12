import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { resolvePlan, autoPlan } from '../sim/lineup';
import { fixRoster, rosterIssues } from './roster';

describe('fixRoster', () => {
  it('leaves a valid generated roster alone', () => {
    const { players } = generateLeague(3);
    const org = players.filter((p) => p.teamId === 0);
    expect(fixRoster(org)).toEqual([]);
    expect(rosterIssues(org.filter((p) => p.level === 'MLB'))).toEqual([]);
  });

  it('refills a depleted roster with the right shape', () => {
    const { players } = generateLeague(3);
    const org = players.filter((p) => p.teamId === 0);
    // Send down three starters and both catchers.
    for (const p of org.filter((x) => x.level === 'MLB' && (x.position === 'SP' || x.position === 'C')).slice(0, 5)) p.level = 'AAA';
    fixRoster(org);
    const active = org.filter((p) => p.level === 'MLB');
    expect(active).toHaveLength(26);
    expect(rosterIssues(active)).toEqual([]);
  });

  it('trims an overfull roster', () => {
    const { players } = generateLeague(4);
    const org = players.filter((p) => p.teamId === 1);
    for (const p of org.filter((x) => x.level === 'AAA').slice(0, 6)) p.level = 'MLB';
    fixRoster(org);
    expect(org.filter((p) => p.level === 'MLB')).toHaveLength(26);
  });
});

describe('resolvePlan', () => {
  const { players } = generateLeague(5);
  const roster = players.filter((p) => p.teamId === 2 && p.level === 'MLB');

  it('keeps a valid saved plan as is', () => {
    const plan = autoPlan(roster, true);
    plan.lineup.reverse();
    expect(resolvePlan(roster, plan, true).lineup).toEqual(plan.lineup);
  });

  it('repairs a plan that references a departed player', () => {
    const plan = autoPlan(roster, true);
    const gone = plan.lineup[0]!.playerId;
    const smaller = roster.filter((p) => p.id !== gone);
    const fixed = resolvePlan(smaller, plan, true);
    expect(fixed.lineup).toHaveLength(9);
    expect(fixed.lineup.some((s) => s.playerId === gone)).toBe(false);
    expect(new Set(fixed.lineup.map((s) => s.position)).size).toBe(9);
    expect(fixed.rotation).toHaveLength(5);
  });

  it('drops the DH slot when the DH is off', () => {
    const plan = autoPlan(roster, true);
    const fixed = resolvePlan(roster, plan, false);
    expect(fixed.lineup).toHaveLength(8);
    expect(fixed.lineup.some((s) => s.position === 'DH')).toBe(false);
  });
});
