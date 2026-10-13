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

    const plan = await api.setLevel(loaded!.players.find((p) => p.teamId === 0 && p.level === 'MLB')!.id, 'AAA');
    expect(plan.ok).toBe(true);
    const afterNext = await api.sim('next');
    expect(afterNext.league.phase).toBe('regular');
    const userGames = afterNext.schedule.filter((g) => g.played && (g.homeId === 0 || g.awayId === 0));
    expect(userGames).toHaveLength(1);
    const box = await api.getBoxScore(userGames[0]!.id);
    expect(box?.result.log.length).toBeGreaterThan(0);

    // A live game: make a call or two, then let the AI finish.
    const live = await api.liveStart();
    expect(live.status).toBe('live');
    if (live.status === 'live') {
      const next = await api.liveCommand({ type: live.situation.userBatting ? 'swing' : 'ibb' });
      expect(['live', 'final']).toContain(next.status);
      const fin = await api.liveFinish();
      expect(fin.status).toBe('final');
      if (fin.status === 'final') {
        const g = fin.save.schedule.find((x) => x.id === live.gameId)!;
        expect(g.played).toBe(true);
        expect((await api.getBoxScore(live.gameId))?.result.log.length).toBeGreaterThan(0);
      }
    }

    const done = await api.sim('season');
    expect(done.schedule.every((g) => g.played)).toBe(true);
    const wins = done.teams.reduce((s, t) => s + t.wins, 0);
    expect(wins).toBe(24);

    // Playoffs, then the offseason stages back to a new preseason.
    const post = await api.sim('playoffs');
    expect(post.league.playoffs?.championId).not.toBeNull();
    let r = await api.advance();
    expect(r.ok && r.save.league.offseason).toBe('review');
    for (const stage of ['resign', 'freeAgency', 'draft']) {
      r = await api.advance();
      expect(r.ok && r.save.league.offseason).toBe(stage);
    }
    r = await api.advance();
    expect(r.ok && r.save.league.phase).toBe('preseason');
    expect(r.ok && r.save.league.season).toBe(2028);
    const reloaded = await createEngineApi(new GameDB('api-test')).loadSave(id);
    expect(reloaded?.league.season).toBe(2028);
    expect(reloaded?.schedule.every((g) => !g.played)).toBe(true);
    expect(reloaded?.players.some((p) => p.draftProspect)).toBe(false);
    expect(reloaded?.league.history).toHaveLength(1);

  }, 20000);
});
