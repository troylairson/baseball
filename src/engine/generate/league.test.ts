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
    expect(players.every((p) => p.contract && p.contract.salary >= 760)).toBe(true);
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
