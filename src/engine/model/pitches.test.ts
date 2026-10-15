import { describe, expect, it } from 'vitest';
import { exportRoster, leagueFromRoster, parseRosterFile } from '../generate/rosterFile';
import { generateLeague } from '../generate/league';
import { Rng } from '../rng';
import { liveGame, simGame, type TeamGameInput } from '../sim/game';
import type { PlayEvent } from '../sim/plays';
import { autoPlan } from '../sim/lineup';
import { paProbabilities, timesThroughPenalty } from '../sim/pa';
import { arsenalOf, developArsenal, generateArsenal, mixTraits, pitchGrade, pitchVelo } from './pitches';

const { league, teams, players } = generateLeague(5);
const pitchers = players.filter((p) => p.pitching && p.level === 'MLB');

describe('pitch arsenals', () => {
  it('gives starters three to five pitches and relievers two or three', () => {
    for (const p of pitchers) {
      const a = generateArsenal(p);
      const n = a.pitches.length;
      if (p.position === 'SP') {
        expect(n).toBeGreaterThanOrEqual(3);
        expect(n).toBeLessThanOrEqual(5);
      } else {
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(3);
      }
      expect(a.pitches.reduce((s, x) => s + x.usage, 0)).toBeCloseTo(1, 1);
      expect(new Set(a.pitches.map((x) => x.type)).size).toBe(n);
    }
  });

  it('is stable for a player and believable in speed', () => {
    const p = pitchers.find((x) => x.position === 'SP')!;
    expect(generateArsenal(p)).toEqual(generateArsenal(p));
    const velos = pitchers.map((x) => { const a = generateArsenal(x); return pitchVelo(a.pitches[0]!.type, a, x.pitching!); });
    const mean = velos.reduce((s, v) => s + v, 0) / velos.length;
    expect(mean).toBeGreaterThan(91.5);
    expect(mean).toBeLessThan(95.5);
    expect(Math.max(...velos)).toBeLessThan(103);
  });

  it('grades pitches from the ratings, so they grow with the pitcher', () => {
    const p = pitchers[0]!;
    const a = generateArsenal(p);
    const better = { ...p.pitching!, stuff: p.pitching!.stuff + 10, movement: p.pitching!.movement + 10, control: p.pitching!.control + 10 };
    for (const x of a.pitches) expect(pitchGrade(x, better)).toBeGreaterThanOrEqual(pitchGrade(x, p.pitching!));
  });

  it('lets young pitchers add a pitch now and then', () => {
    const young = pitchers.filter((p) => p.position === 'SP' && p.age <= 25).map((p) => structuredClone(p));
    young.forEach((p) => { p.arsenal = undefined; arsenalOf(p); });
    const rng = new Rng(1);
    let added = 0;
    for (let year = 0; year < 5; year++) for (const p of young) if (developArsenal(p, rng)) added++;
    expect(added).toBeGreaterThan(0);
    for (const p of young) expect(p.arsenal!.pitches.length).toBeLessThanOrEqual(5);
  });

  it('survives a roster file round trip', () => {
    const src = players.map((p) => structuredClone(p));
    src.forEach((p) => arsenalOf(p));
    const file = parseRosterFile(JSON.parse(JSON.stringify(exportRoster({ league, teams, players: src }))));
    const back = leagueFromRoster(file, 1).players.filter((p) => p.pitching);
    const ace = src.find((p) => p.position === 'SP' && p.teamId !== null)!;
    const twin = back.find((p) => p.firstName === ace.firstName && p.lastName === ace.lastName)!;
    expect(twin.arsenal!.pitches.map((x) => x.type)).toEqual(ace.arsenal!.pitches.map((x) => x.type));
  });
});

describe('pitch effects', () => {
  const sp = pitchers.find((p) => p.position === 'SP')!;
  const hitter = players.find((p) => !p.pitching && p.level === 'MLB')!;
  const base = { bat: hitter.batting, bats: hitter.bats, pitch: sp.pitching!, throws: sp.throws, defense: 50 } as const;

  it('makes hitters better each time through the order, less so against deep arsenals', () => {
    const mix = mixTraits(generateArsenal(sp), sp.pitching!);
    const k1 = paProbabilities({ ...base, mix, timesFaced: 1 }).k;
    const k3 = paProbabilities({ ...base, mix, timesFaced: 3 }).k;
    expect(k3).toBeLessThan(k1);
    expect(timesThroughPenalty(3, 2)).toBeGreaterThan(timesThroughPenalty(3, 5));
  });

  it('keeps ground-ball pitchers in the park', () => {
    const mix = mixTraits(generateArsenal(sp), sp.pitching!);
    const sinkerballer = paProbabilities({ ...base, mix: { ...mix, gb: 0.8 } }).hr;
    const flyballer = paProbabilities({ ...base, mix: { ...mix, gb: -0.6 } }).hr;
    expect(sinkerballer).toBeLessThan(flyballer * 0.8);
  });

  it('names pitches in play-by-play and play events', () => {
    const input = (teamId: number): TeamGameInput => {
      const roster = players.filter((p) => p.teamId === teamId && p.level === 'MLB');
      const plan = autoPlan(roster, true);
      return { team: teams[teamId]!, roster, plan, starterId: plan.rotation[0]! };
    };
    const r = simGame(input(0), input(1), true, new Rng(3), true);
    expect(r.log.some((l) => / strikes out (swinging|looking) on an? [a-z]+\./.test(l))).toBe(true);
    // Play events come from live games.
    const gen = liveGame(input(0), input(1), true, new Rng(4), true, undefined, { teamId: 0 });
    const events: PlayEvent[] = [];
    let step = gen.next();
    while (!step.done) {
      events.push(...step.value.events);
      step = gen.next({ type: 'auto' });
    }
    const pa = events.find((e) => e.kind === 'pa' && e.pitches?.length)!;
    expect(pa.pitchTypes).toHaveLength(pa.pitches!.length);
    expect(pa.velos!.every((v) => v > 60 && v < 105)).toBe(true);
  });
});
