import { describe, expect, it } from 'vitest';
import { autoPlan, generateLeague, liveGame, Rng, type PlayEvent } from '../../engine';
import type { TeamGameInput } from '../../engine/sim/game';
import { buildTimeline, sample } from './director';
import { basePoint, dist, HOME } from './geometry';

const { teams, players } = generateLeague(8);
const input = (id: number): TeamGameInput => {
  const roster = players.filter((p) => p.teamId === id && p.level === 'MLB');
  const plan = autoPlan(roster, true);
  return { team: teams[id]!, roster, plan, starterId: plan.rotation[0]! };
};

function events(seed: number): PlayEvent[] {
  const gen = liveGame(input(0), input(1), true, new Rng(seed), true, undefined, { teamId: 0 });
  const out: PlayEvent[] = [];
  let step = gen.next();
  while (!step.done) {
    out.push(...step.value.events);
    step = gen.next({ type: 'auto' });
  }
  return out.concat(step.value.events ?? []);
}

describe('play director', () => {
  const all = [1, 2, 3, 4, 5, 6].flatMap(events).filter((e) => e.kind === 'pa' || e.kind === 'steal');

  it('builds finite, reasonably short timelines for every play', () => {
    for (const speed of ['play', 'pitch'] as const) {
      for (const e of all) {
        const tl = buildTimeline({ event: e, speed });
        expect(Number.isFinite(tl.duration), e.text).toBe(true);
        expect(tl.duration, e.text).toBeLessThan(speed === 'play' ? 7000 : 14000);
        expect(tl.marks.some((m) => m.kind === 'reveal'), e.text).toBe(true);
      }
    }
  });

  it('leaves every runner where the play put him', () => {
    for (const e of all) {
      const tl = buildTimeline({ event: e, speed: 'play' });
      for (const r of e.runners) {
        const track = tl.tracks.find((t) => t.key === `r${r.id}`);
        if (!track) continue;
        const end = sample(track.frames, tl.duration);
        if (r.out || r.to === 4) {
          expect(end.o, `${e.text} (${r.id})`).toBeCloseTo(0);
        } else {
          expect(dist(end, basePoint(r.to)), `${e.text} (${r.id} to ${r.to})`).toBeLessThan(15);
          expect(end.o).toBeCloseTo(1);
        }
      }
    }
  });

  it('beats runners who are thrown out with the ball', () => {
    for (const e of all.filter((x) => x.result === 'GO' || x.result === 'DP')) {
      const tl = buildTimeline({ event: e, speed: 'play' });
      const ball = tl.tracks.find((t) => t.key === 'ball')!;
      for (const r of e.runners.filter((x) => x.out && x.to > 0)) {
        const runner = tl.tracks.find((t) => t.key === `r${r.id}`)!;
        const bag = basePoint(r.to);
        const runnerAt = runner.frames.find((f) => dist(f, bag) < 1)!.t;
        const ballAt = ball.frames.find((f) => dist(f, bag) < 12 && f.t > 0)?.t ?? Infinity;
        expect(ballAt, e.text).toBeLessThanOrEqual(runnerAt);
      }
    }
  });

  it('sends home runs over the fence and out of sight', () => {
    const hr = all.filter((e) => e.result === 'HR');
    expect(hr.length).toBeGreaterThan(0);
    for (const e of hr) {
      const tl = buildTimeline({ event: e, speed: 'play' });
      const end = sample(tl.tracks.find((t) => t.key === 'ball')!.frames, tl.duration);
      expect(end.o).toBeCloseTo(0);
      expect(dist(end, HOME)).toBeGreaterThan(200);
    }
  });
});
