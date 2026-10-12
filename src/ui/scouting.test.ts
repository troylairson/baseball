import { describe, expect, it } from 'vitest';
import { generateLeague, overall } from '../engine';
import { scoutedOverall } from './scouting';

describe('scoutedOverall', () => {
  const { players } = generateLeague(11);

  it('never shows upside for players with no true growth left', () => {
    const finished = players.filter((p) => overall(p, true) <= overall(p));
    expect(finished.length).toBeGreaterThan(0);
    for (const p of finished) {
      const { ovr, pot } = scoutedOverall(p, -1);
      expect(pot).toBe(ovr);
    }
  });

  it('never reports potential below current ability', () => {
    for (const p of players) {
      const { ovr, pot } = scoutedOverall(p, -1);
      expect(pot).toBeGreaterThanOrEqual(ovr);
    }
  });
});
