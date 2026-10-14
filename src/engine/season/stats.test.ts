import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { addLine, emptyBatting, emptyPitching, linesByTeam } from '../model/stats';
import { Rng } from '../rng';
import { ensureCareerDefaults } from './career';
import { generateSchedule } from './schedule';
import { playoffsOver, seasonOver, simDay, type SeasonState } from './season';

describe('stat collection', () => {
  const { league, teams, players } = generateLeague(9);
  const s: SeasonState = { league, teams, players, schedule: generateSchedule(teams, 162, league.season, new Rng(9)), stats: new Map(), userTeamId: 0, seed: 9 };
  ensureCareerDefaults(s);
  while (!seasonOver(s)) simDay(s);
  const regular = [...s.stats.values()].map((x) => ({ bat: { ...x.bat }, pit: { ...x.pit } }));
  while (!playoffsOver(s)) simDay(s);
  const all = [...s.stats.values()];
  const total = (f: (x: (typeof all)[number]) => number) => all.reduce((a, x) => a + f(x), 0);

  it('records holds, blown saves, quality starts and sacrifices at believable rates', () => {
    const perTeam = (n: number) => n / s.teams.length;
    expect(perTeam(total((x) => x.pit.qs))).toBeGreaterThan(30);
    expect(perTeam(total((x) => x.pit.hld))).toBeGreaterThan(20);
    expect(perTeam(total((x) => x.pit.bs))).toBeGreaterThan(5);
    expect(perTeam(total((x) => x.pit.bs))).toBeLessThan(40);
    expect(perTeam(total((x) => x.bat.sh))).toBeGreaterThan(0);
    // Every team-game has exactly one starter: quality starts can't outnumber starts.
    expect(total((x) => x.pit.qs)).toBeLessThanOrEqual(total((x) => x.pit.gs));
  });

  it('keeps postseason stats apart from the regular season', () => {
    const withPost = all.filter((x) => x.post);
    expect(withPost.length).toBeGreaterThan(20);
    const regularHr = regular.reduce((a, x) => a + x.bat.hr, 0);
    expect(total((x) => x.bat.hr)).toBe(regularHr);
  });

  it('splits a traded player season by club, adding up to his totals', () => {
    const traded = all.filter((x) => x.prior?.length);
    expect(traded.length).toBeGreaterThan(0);
    for (const x of traded) {
      const parts = linesByTeam(x);
      expect(new Set(parts.map((p) => p.teamId)).size).toBe(parts.length);
      const bat = emptyBatting();
      const pit = emptyPitching();
      for (const p of parts) {
        addLine(bat, p.bat);
        addLine(pit, p.pit);
      }
      expect(bat).toEqual(x.bat);
      expect(pit).toEqual(x.pit);
      for (const p of parts) {
        expect(p.bat.pa).toBeGreaterThanOrEqual(0);
        expect(p.pit.outs).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('adds lines from older saves that lack the new fields', () => {
    const old = { ...emptyBatting() } as Partial<ReturnType<typeof emptyBatting>>;
    delete old.sh;
    delete old.ibb;
    const dst = old as ReturnType<typeof emptyBatting>;
    addLine(dst, { ...emptyBatting(), sh: 2, ibb: 1, h: 3 });
    expect(dst.sh).toBe(2);
    expect(dst.ibb).toBe(1);
    expect(dst.h).toBe(3);
  });
});
