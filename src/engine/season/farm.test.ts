import { describe, expect, it, vi } from 'vitest';
import { generateLeague } from '../generate/league';
import { Rng } from '../rng';
import { farmTotals } from './farm';
import { generateSchedule } from './schedule';
import { seasonOver, simDay, type SeasonState } from './season';

function season(seed: number): SeasonState {
  const { league, teams, players } = generateLeague(seed);
  return { league, teams, players, schedule: generateSchedule(teams, 162, league.season, new Rng(seed)), stats: new Map(), userTeamId: 0, seed };
}

describe('Triple-A farm games', () => {
  const s = season(77);
  for (let d = 0; d < 60 && !seasonOver(s); d++) simDay(s);
  const farm = s.league.farm!;
  const userGames = s.schedule.filter((g) => g.played && (g.homeId === 0 || g.awayId === 0)).length;

  it('plays every day the big club does, even after call-ups thin the roster', () => {
    expect(farm.games).toBe(userGames);
    expect(farm.wins + farm.losses).toBe(farm.games);
  });

  it('keeps lines only for real players in the organization', () => {
    const ids = [...Object.keys(farm.bat), ...Object.keys(farm.pit)].map(Number);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) expect(s.players.some((p) => p.id === id)).toBe(true);
  });

  it('produces believable stat lines', () => {
    let outs = 0;
    let er = 0;
    for (const id of Object.keys(farm.pit)) {
      const t = farmTotals(farm, Number(id)).pit;
      outs += t.outs;
      er += t.er;
    }
    const era = (er * 27) / outs;
    expect(era).toBeGreaterThan(2.5);
    expect(era).toBeLessThan(6);
  });

  it('leaves big league results unchanged', async () => {
    const farmModule = await import('./farm');
    const spy = vi.spyOn(farmModule, 'playFarmGame');
    const a = season(78);
    for (let d = 0; d < 20; d++) simDay(a);
    const withFarm = a.teams.map((t) => `${t.wins}-${t.losses}`).join(',');
    spy.mockImplementation(() => {});
    const b = season(78);
    for (let d = 0; d < 20; d++) simDay(b);
    spy.mockRestore();
    expect(b.league.farm).toBeUndefined();
    expect(b.teams.map((t) => `${t.wins}-${t.losses}`).join(',')).toBe(withFarm);
  });
});
