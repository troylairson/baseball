import { describe, expect, it } from 'vitest';
import { overall } from '../model/ratings';
import { generateLeague } from './league';
import { scoutRating } from '../scouting';

describe('generateLeague', () => {
  const { league, teams, players } = generateLeague(123);

  it('is reproducible from a seed', () => {
    const again = generateLeague(123);
    expect(again.players.map((p) => p.lastName)).toEqual(players.map((p) => p.lastName));
    expect(again.teams).toEqual(teams);
  });

  it('builds the configured league structure', () => {
    expect(teams).toHaveLength(league.settings.teamCount);
    expect(league.divisions).toHaveLength(league.settings.conferences * league.settings.divisionsPerConference);
    expect(new Set(teams.map((t) => t.abbr)).size).toBe(teams.length);
  });

  it('gives every team a 26-man active roster and a AAA affiliate', () => {
    for (const team of teams) {
      const roster = players.filter((p) => p.teamId === team.id);
      const mlb = roster.filter((p) => p.level === 'MLB');
      expect(mlb).toHaveLength(26);
      expect(mlb.filter((p) => p.position === 'SP')).toHaveLength(5);
      expect(roster.filter((p) => p.level === 'AAA').length).toBeGreaterThan(10);
    }
  });

  it('avoids duplicate box-score names', () => {
    const names = players.map((p) => `${p.firstName[0]}. ${p.lastName}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it('assigns unique ids and contracts to all players', () => {
    expect(new Set(players.map((p) => p.id)).size).toBe(players.length);
    expect(players.filter((p) => p.teamId !== null).every((p) => p.contract && p.contract.salary >= 760)).toBe(true);
    expect(players.filter((p) => p.teamId === null).every((p) => p.demand && !p.contract)).toBe(true);
  });

  it('stocks a free agent market across positions', () => {
    const fa = players.filter((p) => p.teamId === null);
    expect(fa.length).toBe(teams.length * 4);
    expect(new Set(fa.map((p) => p.position)).size).toBeGreaterThanOrEqual(8);
    expect(fa.some((p) => overall(p) >= 48)).toBe(true);
    // Spring: unsigned players take one-year deals.
    expect(fa.every((p) => p.demand!.years === 1)).toBe(true);
  });

  it('keeps ratings on the 20–80 scale with MLB average near 50', () => {
    const mlbStarters = players.filter((p) => p.level === 'MLB');
    const avg = mlbStarters.reduce((s, p) => s + overall(p), 0) / mlbStarters.length;
    expect(avg).toBeGreaterThan(43);
    expect(avg).toBeLessThan(55);
    for (const p of players) {
      expect(overall(p)).toBeGreaterThanOrEqual(20);
      expect(overall(p, true)).toBeGreaterThanOrEqual(overall(p) - 1);
    }
  });

  it('gives young players more projected growth than veterans', () => {
    const gap = (min: number, max: number) => {
      const group = players.filter((p) => p.age >= min && p.age <= max);
      return group.reduce((s, p) => s + overall(p, true) - overall(p), 0) / group.length;
    };
    expect(gap(19, 22)).toBeGreaterThan(gap(28, 40) + 3);
  });

  it('gives players 27 and older no remaining upside', () => {
    for (const p of players.filter((x) => x.age >= 27)) {
      expect(p.battingPotential).toEqual(p.batting);
      expect(p.pitchingPotential).toEqual(p.pitching);
    }
  });
});

describe('scoutRating', () => {
  it('is exact with perfect accuracy and stable across calls', () => {
    expect(scoutRating(55, 1, 'contact', 1)).toEqual({ value: 55, margin: 0 });
    expect(scoutRating(55, 99, 'power', 0.3)).toEqual(scoutRating(55, 99, 'power', 0.3));
  });
});

describe('league sizes', () => {
  it('generates every supported size with legal rosters and a full schedule', async () => {
    const { LEAGUE_SIZES, settingsFor } = await import('./league');
    const { generateSchedule } = await import('../season/schedule');
    const { Rng } = await import('../rng');
    for (const size of Object.keys(LEAGUE_SIZES).map(Number)) {
      const settings = settingsFor({ teamCount: size, gamesPerSeason: 60, designatedHitter: false, difficulty: 1 });
      const g = generateLeague(size, settings);
      expect(g.teams).toHaveLength(size);
      expect(new Set(g.teams.map((t) => t.abbr)).size).toBe(size);
      const sched = generateSchedule(g.teams, 60, g.league.season, new Rng(size));
      for (const t of g.teams) expect(sched.filter((x) => x.homeId === t.id || x.awayId === t.id)).toHaveLength(60);
    }
  });
});
