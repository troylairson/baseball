import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { Rng } from '../rng';
import { ensureCareerDefaults } from './career';
import { emptyCareer, hallOfFameVote, SEASON_RECORDS } from './legacy';
import { advanceOffseason, beginOffseason } from './offseason';
import { generateSchedule } from './schedule';
import { playoffsOver, seasonOver, simDay, type SeasonState } from './season';

describe('legacy', () => {
  const { league, teams, players } = generateLeague(71);
  const s: SeasonState = { league, teams, players, schedule: generateSchedule(teams, 162, league.season, new Rng(71)), stats: new Map(), userTeamId: 0, seed: 71 };
  ensureCareerDefaults(s);
  while (!seasonOver(s)) simDay(s);
  while (!playoffsOver(s)) simDay(s);
  const statsCount = s.stats.size;
  beginOffseason(s);

  it('folds the season into careers and sets the first records', () => {
    expect(s.players.filter((p) => p.career?.seasons === 1).length).toBe(statsCount);
    for (const cat of SEASON_RECORDS) expect(s.league.records?.[cat.key]).toBeDefined();
    const mvp = s.league.history!.at(-1)!.awards[0]!;
    expect(s.players.find((p) => p.id === mvp.playerId)!.career!.awards[0]).toContain('Most Valuable Player');
  });

  it('elects great retired players after a waiting year, once', () => {
    const legend = s.players.find((p) => p.teamId !== null)!;
    legend.career = { ...emptyCareer(), seasons: 18, war: 85 };
    legend.retired = true;
    legend.teamId = null;
    legend.retiredSeason = s.league.season;
    expect(hallOfFameVote(s)).toHaveLength(0); // same year: not eligible yet
    s.league.season++;
    expect(hallOfFameVote(s).map((h) => h.playerId)).toContain(legend.id);
    expect(hallOfFameVote(s).map((h) => h.playerId)).not.toContain(legend.id);
    s.league.season--;
  });

  it('marks retirements with the season', () => {
    for (let k = 0; k < 4; k++) advanceOffseason(s);
    const retired = s.players.filter((p) => p.retired && p.retiredSeason !== undefined);
    expect(retired.length).toBeGreaterThan(5);
  });
});
