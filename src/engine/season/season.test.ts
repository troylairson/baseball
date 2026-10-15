import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { avg, era, obp, slg, type BattingLine, type PitchingLine, addLine, emptyBatting, emptyPitching } from '../model/stats';
import { Rng } from '../rng';
import { generateSchedule } from './schedule';
import { seasonOver, simDay, type SeasonState } from './season';

function newSeason(seed: number): SeasonState {
  const { league, teams, players } = generateLeague(seed);
  return {
    league,
    teams,
    players,
    schedule: generateSchedule(teams, league.settings.gamesPerSeason, league.season, new Rng(seed)),
    stats: new Map(),
    userTeamId: 0,
    seed,
  };
}

describe('season simulation', () => {
  const state = newSeason(2024);
  const started = performance.now();
  let days = 0;
  while (!seasonOver(state) && days++ < 400) simDay(state);
  const elapsed = performance.now() - started;

  const bat: BattingLine = emptyBatting();
  const pit: PitchingLine = emptyPitching();
  for (const s of state.stats.values()) {
    addLine(bat, s.bat);
    addLine(pit, s.pit);
  }
  const games = state.schedule.length;

  it('plays the full schedule quickly', () => {
    expect(seasonOver(state)).toBe(true);
    expect(elapsed).toBeLessThan(15000);
    for (const t of state.teams) expect(t.wins + t.losses).toBe(162);
  });

  it('keeps the books balanced', () => {
    const runs = state.teams.reduce((s, t) => s + t.runsScored, 0);
    expect(runs).toBe(state.teams.reduce((s, t) => s + t.runsAllowed, 0));
    expect(bat.r).toBe(runs);
    expect(pit.r).toBe(runs);
    expect(pit.w).toBe(games);
    expect(pit.l).toBe(games);
    expect(bat.h).toBe(pit.h);
    expect(bat.so).toBe(pit.so);
    expect(bat.hr).toBe(pit.hr);
  });

  it('produces MLB-like league totals', () => {
    const perGame = bat.r / (games * 2);
    const report = {
      'R/G': perGame.toFixed(2),
      AVG: avg(bat).toFixed(3),
      OBP: obp(bat).toFixed(3),
      SLG: slg(bat).toFixed(3),
      'K%': ((bat.so / bat.pa) * 100).toFixed(1),
      'BB%': ((bat.bb / bat.pa) * 100).toFixed(1),
      'HR/G': (bat.hr / (games * 2)).toFixed(2),
      ERA: era(pit).toFixed(2),
      'SB/G': (bat.sb / (games * 2)).toFixed(2),
      'SB%': ((bat.sb / Math.max(1, bat.sb + bat.cs)) * 100).toFixed(0),
      seconds: (elapsed / 1000).toFixed(2),
    };
    console.info(report);
    expect(perGame).toBeGreaterThan(3.9);
    expect(perGame).toBeLessThan(5.1);
    expect(avg(bat)).toBeGreaterThan(0.235);
    expect(avg(bat)).toBeLessThan(0.262);
    expect(obp(bat)).toBeGreaterThan(0.3);
    expect(obp(bat)).toBeLessThan(0.33);
    expect(slg(bat)).toBeGreaterThan(0.38);
    expect(slg(bat)).toBeLessThan(0.44);
    expect(bat.so / bat.pa).toBeGreaterThan(0.2);
    expect(bat.so / bat.pa).toBeLessThan(0.25);
    expect(era(pit)).toBeGreaterThan(3.6);
    expect(era(pit)).toBeLessThan(4.7);
  });

  it('spreads wins realistically', () => {
    const wins = state.teams.map((t) => t.wins);
    // Spread of team wins: MLB runs about 12–16 games; seeds here average 13–14.
    const sd = Math.sqrt(wins.reduce((s, w) => s + (w - 81) ** 2, 0) / wins.length);
    expect(sd).toBeGreaterThan(9);
    expect(sd).toBeLessThan(18);
    // The best team averages about 108 wins across seeds; the record is 116.
    expect(Math.max(...wins)).toBeLessThan(122);
    // Real worst records reach the low 40s (2024 White Sox: 41-121).
    expect(Math.min(...wins)).toBeGreaterThan(40);
  });

  it('uses starters for most innings', () => {
    let starterOuts = 0;
    let starts = 0;
    for (const s of state.stats.values()) {
      if (s.pit.gs) {
        starts += s.pit.gs;
      }
    }
    for (const p of state.players) {
      const s = state.stats.get(p.id);
      if (p.position === 'SP' && s) starterOuts += s.pit.outs;
    }
    expect(starts).toBe(games * 2);
    const ipPerStart = starterOuts / 3 / starts;
    console.info({ ipPerStart: ipPerStart.toFixed(2) });
    expect(ipPerStart).toBeGreaterThan(4.6);
    expect(ipPerStart).toBeLessThan(6.6);
  });

  it('is reproducible', () => {
    const again = newSeason(2024);
    for (let i = 0; i < 5; i++) simDay(again);
    const first = newSeason(2024);
    for (let i = 0; i < 5; i++) simDay(first);
    expect(again.schedule.slice(0, 50)).toEqual(first.schedule.slice(0, 50));
  });
});
