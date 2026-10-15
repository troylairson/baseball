import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { overall } from '../model/ratings';
import { Rng } from '../rng';
import { ensureCareerDefaults } from './career';
import { contractDemand, contractYears, DOLLARS_PER_WAR, expectedWar } from './contracts';
import { makeOffer, MARKET_ROUNDS, offerOutlook, offerScore, openMarket, resolveRound, withdrawOffer } from './market';
import { advanceOffseason, beginOffseason, freeAgents } from './offseason';
import { generateSchedule } from './schedule';
import { playoffsOver, seasonOver, simDay, type SeasonState } from './season';

function atFreeAgency(seed: number): SeasonState {
  const { league, teams, players } = generateLeague(seed);
  const s: SeasonState = { league, teams, players, schedule: generateSchedule(teams, 162, league.season, new Rng(seed)), stats: new Map(), userTeamId: 0, seed };
  ensureCareerDefaults(s);
  while (!seasonOver(s)) simDay(s);
  while (!playoffsOver(s)) simDay(s);
  beginOffseason(s);
  advanceOffseason(s); // -> resign
  advanceOffseason(s); // -> free agency (market opens)
  return s;
}

describe('contract pricing', () => {
  it('prices players by projected wins', () => {
    const { players } = generateLeague(2);
    const prime = players.filter((p) => p.teamId !== null && p.age >= 27 && p.age <= 30 && p.position !== 'RP' && expectedWar(p) >= 2);
    for (const p of prime) {
      const d = contractDemand(p);
      const perWar = (d.salary - 760) / expectedWar(p);
      expect(perWar).toBeGreaterThan(DOLLARS_PER_WAR * 0.75);
      expect(perWar).toBeLessThan(DOLLARS_PER_WAR * 1.5);
    }
  });

  it('gives young stars long deals and old players short ones', () => {
    expect(contractYears(5, 26)).toBeGreaterThanOrEqual(8);
    expect(contractYears(5, 34)).toBeLessThanOrEqual(2);
    expect(contractYears(0.3, 28)).toBe(1);
  });
});

describe('free agent market', () => {
  const s = atFreeAgency(21);

  it('opens with free agency and runs in rounds', () => {
    expect(s.league.offseason).toBe('freeAgency');
    expect(s.league.market?.round).toBe(1);
  });

  it('lets players sign with the best offer and prefers more money', () => {
    const fa = freeAgents(s.players).sort((a, b) => overall(b) - overall(a))[0]!;
    const team = s.teams[0]!;
    const ask = contractDemand(fa);
    const low = offerScore(fa, { teamId: team.id, salary: ask.salary * 0.8, years: ask.years }, team);
    const high = offerScore(fa, { teamId: team.id, salary: ask.salary * 1.2, years: ask.years }, team);
    expect(high).toBeGreaterThan(low);
    expect(offerOutlook(s, { playerId: fa.id, teamId: 0, salary: ask.salary * 0.5, years: 1 })).toBe('unlikely');
  });

  it('signs the user a player who gets a rich offer', () => {
    const fa = freeAgents(s.players).filter((p) => expectedWar(p) > 1).sort((a, b) => overall(b) - overall(a))[2]!;
    const ask = contractDemand(fa);
    expect(makeOffer(s, { playerId: fa.id, teamId: 0, salary: Math.round(ask.salary * 1.6), years: ask.years }).ok).toBe(true);
    const summary = resolveRound(s);
    expect(summary.signed).toContain(fa.id);
    expect(fa.teamId).toBe(0);
    expect(s.league.market!.round).toBe(2);
  });

  it('withdraws offers and rejects bad ones', () => {
    const fa = freeAgents(s.players)[0]!;
    expect(makeOffer(s, { playerId: fa.id, teamId: 0, salary: 100, years: 1 }).ok).toBe(false);
    makeOffer(s, { playerId: fa.id, teamId: 0, salary: 5000, years: 1 });
    withdrawOffer(s, fa.id);
    expect(s.league.market!.offers.some((o) => o.playerId === fa.id)).toBe(false);
  });

  it('lets AI clubs sign most of the good free agents within budget', { timeout: 30000 }, () => {
    const t = atFreeAgency(22);
    const good = freeAgents(t.players).filter((p) => expectedWar(p) >= 2);
    for (let r = 1; r <= MARKET_ROUNDS; r++) resolveRound(t, r === MARKET_ROUNDS);
    const signed = good.filter((p) => p.teamId !== null);
    // About half sign in the winter (30–70% across seeds); the rest take one-year deals in spring.
    expect(signed.length / Math.max(1, good.length)).toBeGreaterThan(0.3);
    for (const p of signed) expect(p.contract!.salary).toBeGreaterThan(760 * 2);
  });

  it('closes when moving on to the draft', { timeout: 30000 }, () => {
    const t = atFreeAgency(23);
    advanceOffseason(t);
    expect(t.league.market).toBeNull();
    expect(t.league.offseason).toBe('draft');
    openMarket(t);
  });
});
