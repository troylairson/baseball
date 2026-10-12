import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { overall } from '../model/ratings';
import { Rng } from '../rng';
import { ensureCareerDefaults } from './career';
import { advanceOffseason, draftPool, expiringFor, freeAgents, resignPlayer, signFreeAgent } from './offseason';
import { rosterIssues } from './roster';
import { generateSchedule } from './schedule';
import { playoffsOver, seasonOver, simDay, type SeasonState } from './season';
import { beginOffseason } from './offseason';

function newCareer(seed: number): SeasonState {
  const { league, teams, players } = generateLeague(seed);
  const state: SeasonState = {
    league, teams, players,
    schedule: generateSchedule(teams, league.settings.gamesPerSeason, league.season, new Rng(seed)),
    stats: new Map(), userTeamId: 0, seed,
  };
  ensureCareerDefaults(state);
  return state;
}

function playSeason(state: SeasonState) {
  let guard = 0;
  while (!seasonOver(state) && guard++ < 400) simDay(state);
  while (!playoffsOver(state) && guard++ < 500) simDay(state);
}

describe('career loop', () => {
  const state = newCareer(99);
  const startSeason = state.league.season;
  const firstPlayer = state.players.find((p) => p.teamId === 3 && p.age < 30)!;
  const startAge = firstPlayer.age;
  const seasons = 3;
  const champions: number[] = [];
  let removedTotal = 0;

  for (let i = 0; i < seasons; i++) {
    playSeason(state);
    champions.push(state.league.playoffs!.championId!);
    beginOffseason(state);
    advanceOffseason(state); // review -> resign
    // The user re-signs their best expiring player and lets the rest go.
    const expiring = expiringFor(state, 0).sort((a, b) => overall(b) - overall(a));
    if (expiring[0]) resignPlayer(state, expiring[0].id);
    advanceOffseason(state); // -> free agency
    const fa = freeAgents(state.players).sort((a, b) => overall(b) - overall(a))[0];
    if (fa) signFreeAgent(state, 0, fa.id);
    advanceOffseason(state); // -> draft (AI picks until the user is up)
    removedTotal += advanceOffseason(state).length; // finish draft -> new season
  }

  it('plays several full seasons with playoffs and crowns champions', () => {
    expect(state.league.season).toBe(startSeason + seasons);
    expect(state.league.phase).toBe('preseason');
    expect(state.league.history).toHaveLength(seasons);
    expect(champions.every((c) => c >= 0)).toBe(true);
    for (const rec of state.league.history!) expect(rec.awards.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps every roster legal and every player on at most one team', () => {
    for (const t of state.teams) {
      const active = state.players.filter((p) => p.teamId === t.id && p.level === 'MLB' && !p.retired);
      expect(rosterIssues(active)).toEqual([]);
    }
    expect(state.players.filter((p) => p.retired && p.teamId !== null)).toEqual([]);
    expect(draftPool(state.players)).toEqual([]);
    expect(removedTotal).toBeGreaterThan(0);
  });

  it('ages players and keeps the talent level stable', () => {
    if (!firstPlayer.retired) expect(firstPlayer.age).toBe(startAge + seasons);
    const active = state.players.filter((p) => p.teamId !== null && p.level === 'MLB' && !p.retired);
    const avg = active.reduce((s, p) => s + overall(p), 0) / active.length;
    expect(avg).toBeGreaterThan(44);
    expect(avg).toBeLessThan(56);
    const retired = state.players.filter((p) => p.retired).length;
    expect(retired).toBeGreaterThan(30);
  });

  it('gives every team a full new schedule', () => {
    for (const t of state.teams) {
      expect(state.schedule.filter((g) => g.homeId === t.id || g.awayId === t.id)).toHaveLength(state.league.settings.gamesPerSeason);
    }
    expect(state.schedule[0]!.id).toBeGreaterThan(state.league.season * 10000);
    expect(state.stats.size).toBe(0);
  });

  it('keeps the owner informed', () => {
    expect(state.league.owner!.lastReview).toBeTruthy();
    expect(state.league.news!.length).toBeGreaterThan(10);
  });
});
