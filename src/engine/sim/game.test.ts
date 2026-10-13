import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { Rng } from '../rng';
import { simGame, type TeamGameInput } from './game';
import { autoPlan } from './lineup';

const { teams, players } = generateLeague(8);

function input(teamId: number, dh: boolean): TeamGameInput {
  const roster = players.filter((p) => p.teamId === teamId && p.level === 'MLB');
  const plan = autoPlan(roster, dh);
  return { team: teams[teamId]!, roster, plan, starterId: plan.rotation[0]! };
}

describe('autoPlan', () => {
  it('fields every position once and builds a full staff', () => {
    const plan = autoPlan(players.filter((p) => p.teamId === 0 && p.level === 'MLB'), true);
    expect(plan.lineup).toHaveLength(9);
    expect(new Set(plan.lineup.map((s) => s.position)).size).toBe(9);
    expect(new Set(plan.lineup.map((s) => s.playerId)).size).toBe(9);
    expect(plan.rotation).toHaveLength(5);
    expect(plan.closer).not.toBeNull();
  });
});

describe('simGame', () => {
  for (const dh of [true, false]) {
    it(`produces a consistent box score (DH ${dh ? 'on' : 'off'})`, () => {
      for (let seed = 0; seed < 50; seed++) {
        const r = simGame(input(0, dh), input(1, dh), dh, new Rng(seed), seed === 0);
        expect(r.home.runs).not.toBe(r.away.runs);
        expect(r.innings).toBeGreaterThanOrEqual(9);
        for (const box of [r.home, r.away]) {
          expect(box.batters.reduce((s, b) => s + b.line.r, 0)).toBe(box.runs);
          expect(box.innings.reduce((s, n) => s + n, 0)).toBe(box.runs);
          expect(box.batters.reduce((s, b) => s + b.line.h, 0)).toBe(box.hits);
        }
        // The away team's pitchers always get through every home half-inning they pitch.
        const awayOuts = r.away.pitchers.reduce((s, p) => s + p.line.outs, 0);
        expect(awayOuts).toBeLessThanOrEqual(r.innings * 3);
        const homeOuts = r.home.pitchers.reduce((s, p) => s + p.line.outs, 0);
        expect(homeOuts).toBe(r.innings * 3);
        expect(r.home.pitchers.reduce((s, p) => s + p.line.r, 0)).toBe(r.away.runs);
        expect(r.winningPitcher).not.toBeNull();
        expect(r.losingPitcher).not.toBeNull();
        if (seed === 0) expect(r.log.length).toBeGreaterThan(50);
        if (!dh) expect(r.home.batters.some((b) => b.position === 'P')).toBe(true);
      }
    });
  }
});

describe('team strategy', () => {
  const run = (strategy: import('../model/types').TeamStrategy) => {
    let sb = 0;
    let starterOuts = 0;
    let pa = 0;
    let ab = 0;
    for (let seed = 0; seed < 150; seed++) {
      const away = { ...input(0, false), strategy };
      const r = simGame(away, input(1, false), false, new Rng(seed));
      sb += r.away.batters.reduce((s, b) => s + b.line.sb + b.line.cs, 0);
      starterOuts += r.away.pitchers[0]!.line.outs;
      pa += r.away.batters.reduce((s, b) => s + b.line.pa, 0);
      ab += r.away.batters.reduce((s, b) => s + b.line.ab + b.line.bb + b.line.hbp + b.line.sf, 0);
    }
    return { attempts: sb, starterOuts, sacs: pa - ab };
  };
  const low = run({ baserunning: 0, smallBall: 0, starterLeash: 0 });
  const high = run({ baserunning: 2, smallBall: 2, starterLeash: 2 });

  it('aggressive baserunning attempts more steals', () => expect(high.attempts).toBeGreaterThan(low.attempts * 1.8));
  it('small ball lays down sacrifice bunts', () => {
    expect(low.sacs).toBe(0);
    expect(high.sacs).toBeGreaterThan(20);
  });
  it('a long leash lets starters work deeper', () => expect(high.starterOuts).toBeGreaterThan(low.starterOuts * 1.1));
});
