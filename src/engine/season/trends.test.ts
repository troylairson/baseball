import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { Rng } from '../rng';
import { platoonLineup, resolvePlan } from '../sim/lineup';
import { ensureCareerDefaults } from './career';
import { userLog } from './gamelog';
import { generateSchedule } from './schedule';
import { activeRoster, simDay, type SeasonState } from './season';
import { applyTrendAction, detectTrends } from './trends';

function played(seed: number, days: number): SeasonState {
  const { league, teams, players } = generateLeague(seed);
  const s: SeasonState = { league, teams, players, schedule: generateSchedule(teams, 162, league.season, new Rng(seed)), stats: new Map(), userTeamId: 0, seed };
  ensureCareerDefaults(s);
  for (let i = 0; i < days; i++) simDay(s);
  return s;
}

describe('game logs', () => {
  it('records every user game and matches season totals', () => {
    const s = played(7, 40);
    const log = userLog(s.league);
    const team = s.teams.find((t) => t.id === 0)!;
    expect(log.team.length).toBe(team.wins + team.losses);
    for (const [id, games] of Object.entries(log.bat)) {
      const season = s.stats.get(Number(id))?.bat;
      if (!season) continue;
      const h = games.reduce((n, g) => n + g.h, 0);
      // Logs only cover games for the user's team; traded players can have more.
      expect(h).toBeLessThanOrEqual(season.h);
    }
    for (const t of log.team) expect(t.spOuts + t.bpOuts).toBeGreaterThanOrEqual(24);
  });
});

describe('trends', () => {
  it('finds something to talk about by midseason and sorts by priority', () => {
    const s = played(11, 70);
    const trends = detectTrends(s);
    expect(trends.length).toBeGreaterThan(0);
    for (let i = 1; i < trends.length; i++) expect(trends[i - 1]!.priority).toBeGreaterThanOrEqual(trends[i]!.priority);
    expect(new Set(trends.map((t) => t.id)).size).toBe(trends.length);
  });

  it('flags a hitless streak with season context', () => {
    const s = played(12, 30);
    const log = userLog(s.league);
    const team = s.teams.find((t) => t.id === 0)!;
    const plan = resolvePlan(activeRoster(s.players, 0), team.plan, s.league.settings.designatedHitter);
    const id = plan.lineup.find((x) => x.position !== 'P')!.playerId;
    const games = log.bat[id]!;
    for (const g of games.slice(-5)) { g.h = 0; g.ab = Math.max(g.ab, 3); g.hr = 0; g.xbh = 0; }
    const t = detectTrends(s).find((x) => x.id === `hitless-${id}`);
    expect(t).toBeDefined();
    expect(t!.context).toMatch(/on the season/);
    expect(t!.suggestions.some((x) => x.action?.kind === 'bench')).toBe(true);
  });

  it('applies lineup, bullpen and strategy actions', () => {
    const s = played(13, 20);
    const team = s.teams.find((t) => t.id === 0)!;
    const useDH = s.league.settings.designatedHitter;
    const plan = () => resolvePlan(activeRoster(s.players, 0), team.plan, useDH);
    const leadoff = plan().lineup.filter((x) => x.position !== 'P')[0]!.playerId;

    expect(applyTrendAction(s, { kind: 'battingOrder', playerId: leadoff, slot: 6 }).ok).toBe(true);
    expect(plan().lineup.filter((x) => x.position !== 'P')[6]!.playerId).toBe(leadoff);

    expect(applyTrendAction(s, { kind: 'bench', playerId: leadoff }).ok).toBe(true);
    expect(plan().lineup.some((x) => x.playerId === leadoff)).toBe(false);

    const setup = plan().setup[0]!;
    const oldCloser = plan().closer;
    expect(applyTrendAction(s, { kind: 'swapCloser', playerId: setup }).ok).toBe(true);
    expect(plan().closer).toBe(setup);
    expect(plan().setup).toContain(oldCloser);

    const starter = plan().rotation[0]!;
    expect(applyTrendAction(s, { kind: 'toBullpen', playerId: starter }).ok).toBe(true);
    expect(plan().rotation).not.toContain(starter);
    expect(plan().rotation).toHaveLength(5);

    expect(applyTrendAction(s, { kind: 'strategy', patch: { starterLeash: 2 } }).ok).toBe(true);
    expect(team.strategy!.starterLeash).toBe(2);
  });

  it('platoons a hitter against same-side starters', () => {
    const s = played(15, 25);
    const team = s.teams.find((t) => t.id === 0)!;
    const useDH = s.league.settings.designatedHitter;
    const hitter = resolvePlan(activeRoster(s.players, 0), team.plan, useDH).lineup.find((x) => x.position !== 'P')!.playerId;
    expect(applyTrendAction(s, { kind: 'platoon', playerId: hitter, hand: 'L' }).ok).toBe(true);
    expect(team.platoon!.L).toContain(hitter);
    const plan = resolvePlan(activeRoster(s.players, 0), team.plan, useDH);
    const swapped = platoonLineup(plan, activeRoster(s.players, 0), team.platoon!.L);
    expect(swapped.lineup.some((x) => x.playerId === hitter)).toBe(false);
    expect(swapped.lineup).toHaveLength(plan.lineup.length);
    expect(applyTrendAction(s, { kind: 'unplatoon', playerId: hitter }).ok).toBe(true);
    expect(team.platoon!.L).not.toContain(hitter);
  });

  it('flags a tense clubhouse with a way to act', () => {
    const s = played(16, 20);
    s.teams.find((t) => t.id === 0)!.chemistry = 25;
    const t = detectTrends(s).find((x) => x.id === 'chemistry');
    expect(t?.tone).toBe('bad');
    expect(t!.suggestions.length).toBeGreaterThan(0);
  });

  it('is quiet outside the regular season', () => {
    const s = played(14, 5);
    s.league.phase = 'offseason';
    expect(detectTrends(s)).toEqual([]);
  });
});
