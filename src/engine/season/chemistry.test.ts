import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { chemistryFactors, chemistryRatingBonus, chemistryTarget, isBadApple, isLeader, snapshotCores, updateChemistry } from './chemistry';

describe('team chemistry', () => {
  const base = () => generateLeague(77);

  it('rewards veteran leaders and punishes troublemakers', () => {
    const s = base();
    const active = s.players.filter((p) => p.teamId === 0 && p.level === 'MLB');
    for (const p of active) p.personality = { workEthic: 55, leadership: 45, loyalty: 50, greed: 50 };
    const neutral = chemistryTarget(s, 0);
    active[0]!.personality.leadership = 80;
    active[0]!.age = 33;
    expect(isLeader(active[0]!)).toBe(true);
    expect(chemistryTarget(s, 0)).toBeGreaterThan(neutral);
    for (const p of active.slice(1, 3)) p.personality = { workEthic: 30, leadership: 40, loyalty: 40, greed: 75 };
    expect(isBadApple(active[1]!)).toBe(true);
    expect(chemistryTarget(s, 0)).toBeLessThan(neutral);
    expect(chemistryFactors(s, 0).some((f) => f.label.startsWith('Clubhouse troublemakers'))).toBe(true);
  });

  it('penalizes heavy roster turnover', () => {
    const s = base();
    snapshotCores(s);
    const before = chemistryTarget(s, 0);
    s.teams[0]!.core = s.teams[0]!.core!.slice(0, 10);
    expect(chemistryTarget(s, 0)).toBeLessThan(before);
  });

  it('drifts toward its target and maps to a small rating effect', () => {
    const s = base();
    updateChemistry(s);
    const team = s.teams[0]!;
    expect(team.chemistry).toBeGreaterThanOrEqual(10);
    expect(team.chemistry).toBeLessThanOrEqual(90);
    expect(chemistryRatingBonus({ chemistry: 90 })).toBe(1);
    expect(chemistryRatingBonus({ chemistry: 50 })).toBe(0);
    expect(chemistryRatingBonus({ chemistry: 10 })).toBe(-1);
  });
});
