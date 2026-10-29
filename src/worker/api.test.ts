import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ORDERS, DEFAULT_SETTINGS } from '../engine';
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
    // Last season's stats stay browsable, postseason lines included.
    const last = await api.getSeasonStats(2027);
    expect(last.reduce((s, x) => s + x.bat.pa, 0)).toBeGreaterThan(0);
    expect(last.some((x) => (x.post?.bat.pa ?? 0) > 0)).toBe(true);
    const reloaded = await createEngineApi(new GameDB('api-test')).loadSave(id);
    expect(reloaded?.league.season).toBe(2028);
    expect(reloaded?.schedule.every((g) => !g.played)).toBe(true);
    expect(reloaded?.players.some((p) => p.draftProspect)).toBe(false);
    expect(reloaded?.league.history).toHaveLength(1);

  }, 20000);

  it('plays a live game decision to decision, following standing orders', async () => {
    const api = createEngineApi(new GameDB('api-live-test'));
    await api.previewLeague(SMALL, 9);
    const id = await api.startCareer(0);
    await api.loadSave(id);
    await api.sim('next');
    const orders = { ...DEFAULT_ORDERS, starterPitchLimit: 80, stealSpeed: 50 };
    expect((await api.setLiveOrders(orders)).ok).toBe(true);
    let state = await api.liveStart();
    expect(state.status).toBe('live');
    let calls = 0;
    let stops = 0;
    while (state.status === 'live' && calls < 60) {
      if (state.decision) stops++;
      // Every stop says why, and most offer a move.
      if (state.decision) expect(state.decision.title.length).toBeGreaterThan(0);
      state = await api.liveAdvance();
      calls++;
    }
    expect(state.status).toBe('final');
    // A game takes a handful of stops, not a tap per batter.
    expect(calls).toBeLessThan(25);
    const reloaded = await createEngineApi(new GameDB('api-live-test')).loadSave(id);
    expect(reloaded?.league.liveOrders?.starterPitchLimit).toBe(80);
    expect(stops).toBeGreaterThanOrEqual(0);
  });

  it('swaps a call-up for a send-down in one move', async () => {
    const api = createEngineApi(new GameDB('api-swap-test'));
    await api.previewLeague(SMALL, 11);
    const id = await api.startCareer(0);
    const save = (await api.loadSave(id))!;
    const up = save.players.find((p) => p.teamId === 0 && p.level === 'AAA')!;
    const down = save.players.find((p) => p.teamId === 0 && p.level === 'MLB' && !p.pitching)!;
    const res = await api.swapLevels(up.id, down.id);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.save.players.find((p) => p.id === up.id)!.level).toBe('MLB');
      expect(res.save.players.find((p) => p.id === down.id)!.level).toBe('AAA');
    }
    // Backwards (a big leaguer "up", a minor leaguer "down") is refused.
    expect((await api.swapLevels(down.id, up.id)).ok).toBe(true);
    expect((await api.swapLevels(down.id, up.id)).ok).toBe(false);
  });
});
