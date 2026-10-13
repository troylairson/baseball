import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { Rng } from '../rng';
import { generateSchedule, openingDay } from './schedule';

describe('generateSchedule', () => {
  const { teams } = generateLeague(1);
  const games = generateSchedule(teams, 162, 2027, new Rng(1));

  it('gives every team exactly 162 games, about half at home', () => {
    for (const t of teams) {
      const mine = games.filter((g) => g.homeId === t.id || g.awayId === t.id);
      expect(mine).toHaveLength(162);
      const home = mine.filter((g) => g.homeId === t.id).length;
      expect(home).toBeGreaterThanOrEqual(72);
      expect(home).toBeLessThanOrEqual(90);
    }
  });

  it('never schedules a team twice on one day', () => {
    const seen = new Set<string>();
    for (const g of games) {
      for (const id of [g.homeId, g.awayId]) {
        const key = `${g.date}-${id}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('starts on opening day and ends before November', () => {
    expect(games[0]!.date).toBe(openingDay(2027));
    expect(games[games.length - 1]!.date < '2027-11-01').toBe(true);
  });

  it('handles odd team counts and short seasons', () => {
    const odd = teams.slice(0, 7);
    const short = generateSchedule(odd, 60, 2027, new Rng(2));
    for (const t of odd) {
      const n = short.filter((g) => g.homeId === t.id || g.awayId === t.id).length;
      expect(n).toBeGreaterThanOrEqual(57);
      expect(n).toBeLessThanOrEqual(60);
    }
  });
});

describe('playoffPicture', () => {
  it('lists division leaders, wild cards and the chase with games back', async () => {
    const { playoffPicture } = await import('./playoffs');
    const { teams, league } = generateLeague(3);
    teams.forEach((t, i) => { t.wins = 60 + i; t.losses = 100 - i; });
    const races = playoffPicture(league, teams);
    expect(races).toHaveLength(2);
    for (const race of races) {
      const confTeams = teams.filter((t) => t.conferenceId === race.conferenceId);
      expect(race.rows).toHaveLength(confTeams.length);
      expect(race.rows.filter((r) => r.status === 'division')).toHaveLength(2);
      expect(race.rows.filter((r) => r.status === 'wildcard')).toHaveLength(2);
      const out = race.rows.filter((r) => r.status === 'out');
      expect(out.every((r) => r.games >= 0)).toBe(true);
      expect(out.map((r) => r.games)).toEqual([...out.map((r) => r.games)].sort((a, b) => a - b));
    }
  });
});
