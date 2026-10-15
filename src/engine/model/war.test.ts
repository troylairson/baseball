import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { Rng } from '../rng';
import { generateSchedule } from '../season/schedule';
import { seasonOver, simDay, type SeasonState } from '../season/season';
import { isPitcher } from './ratings';
import { battingWar, eraPlus, fip, leagueRates, opsPlus, pitchingWar } from './war';

describe('advanced stats', () => {
  const { league, teams, players } = generateLeague(31);
  const state: SeasonState = { league, teams, players, schedule: generateSchedule(teams, 162, league.season, new Rng(31)), stats: new Map(), userTeamId: 0, seed: 31 };
  while (!seasonOver(state)) simDay(state);
  const lines = [...state.stats.values()];
  const lg = leagueRates(lines);
  const byId = new Map(players.map((p) => [p.id, p]));

  it('centres plus stats on 100 for the league', () => {
    const regulars = lines.filter((s) => s.bat.pa >= 400);
    const avgOps = regulars.reduce((s, x) => s + opsPlus(x.bat, lg), 0) / regulars.length;
    expect(avgOps).toBeGreaterThan(90);
    expect(avgOps).toBeLessThan(120);
    const starters = lines.filter((s) => s.pit.outs >= 450);
    const avgFip = starters.reduce((s, x) => s + fip(x.pit, lg), 0) / starters.length;
    // Qualified starters run about 0.45 better than league ERA (they're the good ones); seeds vary by ±0.2.
    expect(Math.abs(avgFip - lg.era)).toBeLessThan(0.75);
    expect(starters.every((s) => eraPlus(s.pit, lg) > 30)).toBe(true);
  });

  it('produces a sensible WAR distribution', () => {
    let total = 0;
    let best = 0;
    for (const s of lines) {
      const p = byId.get(s.playerId)!;
      const war = isPitcher(p) ? pitchingWar(s.pit, lg) : battingWar(s.bat, p.position, lg);
      total += war;
      best = Math.max(best, war);
    }
    // MLB hands out roughly 1,000 WAR across 30 teams (~33 per team).
    expect(total / teams.length).toBeGreaterThan(18);
    expect(total / teams.length).toBeLessThan(50);
    expect(best).toBeLessThan(13);
  });
});
