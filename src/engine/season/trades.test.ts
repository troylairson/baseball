import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { overall } from '../model/ratings';
import type { Player } from '../model/types';
import { playerValue } from './contracts';
import { rosterIssues } from './roster';
import { evaluateTrade, executeTrade } from './trades';

function ctx(seed: number) {
  const { league, teams, players } = generateLeague(seed);
  return { league, teams, players, userTeamId: 0 };
}
const mlb = (players: Player[], teamId: number) => players.filter((p) => p.teamId === teamId && p.level === 'MLB');
const best = (list: Player[]) => [...list].sort((a, b) => overall(b) - overall(a))[0]!;
const worst = (list: Player[]) => [...list].sort((a, b) => overall(a) - overall(b))[0]!;

describe('trades', () => {
  it('rejects a lopsided ask for their best player', () => {
    const c = ctx(1);
    const ev = evaluateTrade(c, { partnerId: 1, give: [worst(mlb(c.players, 0)).id], get: [best(mlb(c.players, 1)).id] });
    expect(ev.accepted).toBe(false);
    expect(ev.score).toBeLessThan(0.6);
  });

  it('accepts when they clearly win the deal, and keeps rosters legal', () => {
    const c = ctx(2);
    const ev = evaluateTrade(c, { partnerId: 1, give: [best(mlb(c.players, 0)).id], get: [worst(mlb(c.players, 1)).id] });
    expect(ev.accepted).toBe(true);
    const res = executeTrade(c, { partnerId: 1, give: [best(mlb(c.players, 0)).id], get: [worst(mlb(c.players, 1)).id] });
    expect(res.ok).toBe(true);
    for (const t of [0, 1]) expect(rosterIssues(mlb(c.players, t))).toEqual([]);
  });

  it('cannot be fleeced with a pile of spare parts', () => {
    const c = ctx(3);
    const star = best(mlb(c.players, 1));
    const junk = [...mlb(c.players, 0)].sort((a, b) => overall(a) - overall(b)).slice(0, 5);
    const ev = evaluateTrade(c, { partnerId: 1, give: junk.map((p) => p.id), get: [star.id] });
    expect(ev.accepted).toBe(false);
  });

  it('never accepts a deal that loses value in its own eyes', () => {
    const c = ctx(4);
    for (let partner = 1; partner < 8; partner++) {
      for (const mine of mlb(c.players, 0).slice(0, 8)) {
        for (const theirs of mlb(c.players, partner).slice(0, 8)) {
          const ev = evaluateTrade(c, { partnerId: partner, give: [mine.id], get: [theirs.id] });
          if (!ev.accepted) continue;
          const contending = ev.partnerMode === 'contending';
          expect(playerValue(mine, contending)).toBeGreaterThan(playerValue(theirs, contending));
        }
      }
    }
  });

  it('respects the trade deadline', () => {
    const c = ctx(5);
    c.league.phase = 'regular';
    c.league.date = `${c.league.season}-08-15`;
    const ev = evaluateTrade(c, { partnerId: 1, give: [best(mlb(c.players, 0)).id], get: [worst(mlb(c.players, 1)).id] });
    expect(ev.accepted).toBe(false);
    expect(ev.message).toMatch(/deadline/);
  });
});
