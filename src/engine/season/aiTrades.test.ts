import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { Rng } from '../rng';
import { ensureCareerDefaults } from './career';
import { rosterIssues } from './roster';
import { generateSchedule } from './schedule';
import { maintainRosters, seasonOver, simDay, type SeasonState } from './season';

describe('AI-to-AI trades', () => {
  const { league, teams, players } = generateLeague(9);
  const s: SeasonState = { league, teams, players, schedule: generateSchedule(teams, 162, league.season, new Rng(9)), stats: new Map(), userTeamId: 0, seed: 9 };
  ensureCareerDefaults(s);
  const userBefore = new Set(s.players.filter((p) => p.teamId === 0).map((p) => p.id));
  while (!seasonOver(s)) simDay(s);
  const trades = (s.league.news ?? []).filter((n) => / acquire /.test(n.title));

  it('happens a few times a season, mostly before the deadline', () => {
    expect(trades.length).toBeGreaterThanOrEqual(3);
    for (const n of trades) expect(n.date <= `${s.league.season}-07-31`).toBe(true);
  });

  it('never involves the user without asking', () => {
    for (const n of trades) expect(n.teamId).not.toBe(0);
    const userNow = new Set(s.players.filter((p) => p.teamId === 0).map((p) => p.id));
    for (const id of userBefore) {
      const p = s.players.find((x) => x.id === id)!;
      if (p.teamId !== 0 && p.teamId !== null && !p.retired) expect(userNow.has(id)).toBe(true);
    }
  });

  it('leaves both clubs with legal rosters', () => {
    // Injuries and returns are sorted out each morning; check as the next day would.
    maintainRosters(s);
    for (const t of s.teams.filter((x) => x.id !== 0)) expect(rosterIssues(s.players.filter((p) => p.teamId === t.id && p.level === 'MLB'))).toEqual([]);
  });
});
