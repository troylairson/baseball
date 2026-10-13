import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { Rng } from '../rng';
import { liveGame, simGame, type TeamGameInput } from './game';
import { autoPlan } from './lineup';
import { countAfter, fenceDistance, pitchSequence, type PlayEvent } from './plays';

const { teams, players } = generateLeague(8);

function input(teamId: number): TeamGameInput {
  const roster = players.filter((p) => p.teamId === teamId && p.level === 'MLB');
  const plan = autoPlan(roster, true);
  return { team: teams[teamId]!, roster, plan, starterId: plan.rotation[0]! };
}

/** Play a live game with no manager calls; return every event and the final result. */
function eventsFor(seed: number) {
  const gen = liveGame(input(0), input(1), true, new Rng(seed), true, undefined, { teamId: 0 });
  const events: PlayEvent[] = [];
  let step = gen.next();
  while (!step.done) {
    events.push(...step.value.events);
    step = gen.next({ type: 'auto' });
  }
  events.push(...(step.value.events ?? []));
  return { events, result: step.value };
}

describe('play events', () => {
  const games = Array.from({ length: 25 }, (_, i) => ({ seed: i, ...eventsFor(i) }));
  const all = games.flatMap((g) => g.events);

  it('never change the outcome of a game', () => {
    for (const g of games.slice(0, 10)) {
      const plain = simGame(input(0), input(1), true, new Rng(g.seed));
      expect(g.result.away.runs).toBe(plain.away.runs);
      expect(g.result.home.runs).toBe(plain.home.runs);
    }
  });

  it('account for every out and run', () => {
    for (const g of games) {
      let away = 0;
      let home = 0;
      for (const e of g.events) {
        if (e.kind !== 'pa' && e.kind !== 'steal') continue;
        const outs = e.runners.filter((r) => r.out).length;
        expect(e.outsAfter - e.outsBefore, e.text).toBe(outs);
        const runs = e.runners.filter((r) => r.to === 4).length;
        if (e.half === 'top') away += runs;
        else home += runs;
        expect(e.awayRuns, e.text).toBe(away);
        expect(e.homeRuns, e.text).toBe(home);
      }
      expect(away).toBe(g.result.away.runs);
      expect(home).toBe(g.result.home.runs);
    }
  });

  it('keep the batted ball consistent with the result', () => {
    const pa = all.filter((e) => e.kind === 'pa');
    expect(pa.length).toBeGreaterThan(1500);
    for (const e of pa) {
      const b = e.ball;
      if (['K', 'BB', 'HBP', 'IBB'].includes(e.result!)) {
        expect(b).toBeUndefined();
        continue;
      }
      expect(b, e.text).toBeDefined();
      expect(Math.abs(b!.angle)).toBeLessThanOrEqual(45);
      if (e.result === 'HR') expect(b!.distance).toBeGreaterThan(fenceDistance(b!.angle));
      else expect(b!.distance, e.text).toBeLessThan(fenceDistance(b!.angle));
      if (e.result === 'GO' || e.result === 'DP') {
        expect(b!.type).toBe('ground');
        expect(e.fielders![0]).toBeLessThanOrEqual(6);
      }
      if (e.result === 'DP') expect(e.fielders).toHaveLength(3);
      if (e.result === '2B' || e.result === '3B') expect(e.fielders![0]).toBeGreaterThanOrEqual(7);
    }
  });

  it('end pitch sequences on the right count', () => {
    for (const e of all.filter((x) => x.kind === 'pa' && x.pitches?.length)) {
      const seq = e.pitches!;
      const [b, s] = countAfter(seq, seq.length - 1);
      if (e.result === 'K') {
        expect(seq.at(-1)).toBe('S');
        expect(s).toBe(2);
      } else if (e.result === 'BB') {
        expect(seq.at(-1)).toBe('B');
        expect(b).toBe(3);
      } else {
        expect(b).toBeLessThanOrEqual(3);
        expect(s).toBeLessThanOrEqual(2);
      }
    }
    expect(pitchSequence('K', 1, new Rng(1))).toHaveLength(3);
  });

  it('records steals and substitutions', () => {
    const kinds = new Set(all.map((e) => e.kind));
    expect(kinds.has('steal')).toBe(true);
    expect(kinds.has('pitchingChange')).toBe(true);
  });
});
