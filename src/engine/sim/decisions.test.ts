import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { emptyBatting, emptyPitching } from '../model/stats';
import { Rng } from '../rng';
import { DEFAULT_ORDERS, findDecision, standingOrder, userLead, type DecisionContext } from './decisions';
import { liveGame, type LiveSituation, type TeamGameInput } from './game';
import { autoPlan } from './lineup';

const { teams, players } = generateLeague(14);
const byId = new Map(players.map((p) => [p.id, p]));
const roster = (teamId: number) => players.filter((p) => p.teamId === teamId && p.level === 'MLB');
const plan = autoPlan(roster(0), false);
const hitters = roster(0).filter((p) => !p.pitching);
const myPitcher = roster(0).find((p) => p.position === 'SP')!;
const theirPitcher = roster(1).find((p) => p.position === 'SP')!;
const ctx = (orders = DEFAULT_ORDERS): DecisionContext => ({ players: byId, plan, orders });

function situation(over: Partial<LiveSituation>): LiveSituation {
  return {
    inning: 3, half: 'top', outs: 0, bases: [null, null, null], awayRuns: 0, homeRuns: 0, awayInnings: [], homeInnings: [], awayHits: 0, homeHits: 0,
    battingTeamId: 0, batterId: hitters[0]!.id, batterPosition: 'CF', batterSpot: 1, onDeckId: hitters[1]!.id,
    pitcherId: theirPitcher.id, pitcherPitches: 20, pitcherRole: 'SP', batterLine: emptyBatting(), pitcherLine: emptyPitching(),
    userBatting: true, bench: hitters.slice(9).map((p) => p.id), bullpen: [...plan.setup, ...plan.middle, ...(plan.closer ? [plan.closer] : [])],
    log: [], events: [], ...over,
  };
}

describe('live decisions', () => {
  it('reads the score from the manager side', () => {
    expect(userLead(situation({ half: 'top', awayRuns: 3, homeRuns: 1 }))).toBe(2);
    expect(userLead(situation({ half: 'top', userBatting: false, awayRuns: 3, homeRuns: 1 }))).toBe(-2);
  });

  it('pinch-hits for the pitcher late by standing order, but not for his pinch hitter', () => {
    const pitcherUp = situation({ inning: 7, batterId: myPitcher.id, batterPosition: 'P' });
    expect(standingOrder(pitcherUp, ctx())?.type).toBe('pinchHit');
    const hitterInHisSpot = situation({ inning: 7, batterPosition: 'P' });
    expect(standingOrder(hitterInHisSpot, ctx())).toBeNull();
    expect(standingOrder(pitcherUp, ctx({ ...DEFAULT_ORDERS, pinchHitForPitcher: false }))).toBeNull();
  });

  it('sends fast runners by standing order only above the speed set', () => {
    const fast = [...hitters].sort((a, b) => b.batting.speed - a.batting.speed)[0]!;
    const s = situation({ bases: [fast.id, null, null], outs: 1 });
    expect(standingOrder(s, ctx({ ...DEFAULT_ORDERS, stealSpeed: null }))).toBeNull();
    expect(standingOrder(s, ctx({ ...DEFAULT_ORDERS, stealSpeed: fast.batting.speed }))?.type).toBe('steal');
    expect(standingOrder(s, ctx({ ...DEFAULT_ORDERS, stealSpeed: fast.batting.speed + 1 }))).toBeNull();
  });

  it('stops when your starter tires and suggests a reliever', () => {
    const s = situation({ userBatting: false, half: 'bottom', battingTeamId: 1, pitcherId: myPitcher.id, pitcherPitches: 110, batterId: roster(1)[0]!.id });
    const d = findDecision(s, ctx())!;
    expect(d.kind).toBe('pitching');
    expect(d.suggestion?.command.type).toBe('pitchingChange');
    // Turning the stop off lets the game play on.
    expect(findDecision(s, ctx({ ...DEFAULT_ORDERS, stops: { ...DEFAULT_ORDERS.stops, pitching: false } }))?.kind).not.toBe('pitching');
  });

  it('offers the closer in a save situation', () => {
    const s = situation({ inning: 9, half: 'bottom', userBatting: false, battingTeamId: 1, awayRuns: 3, homeRuns: 1, pitcherId: plan.setup[0]!, pitcherRole: 'SU', batterId: roster(1)[0]!.id });
    const d = findDecision(s, ctx())!;
    expect(d.title).toMatch(/Save/);
    expect(d.suggestion?.command).toEqual({ type: 'pitchingChange', playerId: plan.closer });
  });

  it('plays quietly through ordinary early at-bats', () => {
    expect(findDecision(situation({}), ctx())).toBeNull();
  });
});

describe('pitching orders in the engine', () => {
  const input = (teamId: number, dh: boolean): TeamGameInput => {
    const r = roster(teamId);
    const p = autoPlan(r, dh);
    return { team: teams[teamId]!, roster: r, plan: p, starterId: p.rotation[0]! };
  };

  it('pulls your starter at the pitch count you set', () => {
    for (let seed = 0; seed < 10; seed++) {
      const gen = liveGame(input(0, true), input(1, true), true, new Rng(seed), false, undefined, { teamId: 0, orders: { starterPitchLimit: 70 } });
      let step = gen.next();
      while (!step.done) step = gen.next({ type: 'auto' });
      const starter = step.value.away.pitchers[0]!;
      // He can finish the batter (and inning) he's on, but not much more.
      expect(starter.line.pitches).toBeLessThan(100);
    }
  });

  it('takes a pitcher out of the game once he is pinch-hit for', () => {
    let checked = 0;
    for (let seed = 0; seed < 20 && checked < 3; seed++) {
      const gen = liveGame(input(0, false), input(1, false), false, new Rng(seed), true, undefined, { teamId: 0 });
      let step = gen.next();
      let starter: number | null = null;
      while (!step.done) {
        const s = step.value;
        if (!s.userBatting && starter === null) starter = s.pitcherId;
        if (s.userBatting && s.batterId === starter && s.bench.length) {
          step = gen.next({ type: 'pinchHit', playerId: s.bench[0]! });
          // Next time your team is in the field, someone else is pitching.
          while (!step.done && step.value.userBatting) step = gen.next({ type: 'auto' });
          if (!step.done) {
            expect(step.value.pitcherId).not.toBe(starter);
            checked++;
          }
          break;
        }
        step = gen.next({ type: 'auto' });
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
