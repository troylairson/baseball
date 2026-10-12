import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../engine';
import { GameDB } from '../db/db';
import { createEngineApi } from './api';

const SMALL = { ...DEFAULT_SETTINGS, teamCount: 4, conferences: 1, divisionsPerConference: 1, gamesPerSeason: 12 };

describe('engine api', () => {
  it('creates a career, sims, persists and reloads', async () => {
    const api = createEngineApi(new GameDB('api-test'));
    await api.previewLeague(SMALL, 5);
    const id = await api.startCareer(0);
    const loaded = await api.loadSave(id);
    expect(loaded?.league.phase).toBe('preseason');
    expect(loaded?.schedule).toHaveLength(24);

    const afterNext = await api.sim('next');
    expect(afterNext.league.phase).toBe('regular');
    const userGames = afterNext.schedule.filter((g) => g.played && (g.homeId === 0 || g.awayId === 0));
    expect(userGames).toHaveLength(1);
    const box = await api.getBoxScore(userGames[0]!.id);
    expect(box?.result.log.length).toBeGreaterThan(0);

    const done = await api.sim('season');
    expect(done.schedule.every((g) => g.played)).toBe(true);
    const wins = done.teams.reduce((s, t) => s + t.wins, 0);
    expect(wins).toBe(24);

    // A fresh API instance sees the persisted state.
    const again = await createEngineApi(new GameDB('api-test')).loadSave(id);
    expect(again?.teams.map((t) => t.wins)).toEqual(done.teams.map((t) => t.wins));
    expect(again?.stats.length).toBeGreaterThan(0);
  });
});
