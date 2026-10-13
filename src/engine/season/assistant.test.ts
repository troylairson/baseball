import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { Rng } from '../rng';
import { assistantAdvice, assistantHandleStage } from './assistant';
import { ensureCareerDefaults } from './career';
import { generateSchedule } from './schedule';
import type { SeasonState } from './season';
import { advanceOffseason, expiringFor } from './offseason';

function state(seed: number): SeasonState {
  const { league, teams, players } = generateLeague(seed);
  const s: SeasonState = { league, teams, players, schedule: generateSchedule(teams, 162, league.season, new Rng(seed)), stats: new Map(), userTeamId: 0, seed };
  ensureCareerDefaults(s);
  return s;
}

describe('assistant GM', () => {
  it('spots a minor leaguer who should be up', () => {
    const s = state(41);
    const prospect = s.players.find((p) => p.teamId === 0 && p.level === 'AAA' && p.position === 'SS')!;
    for (const k of ['contact', 'power', 'eye'] as const) prospect.batting[k] = 78;
    prospect.fielding.defense = 75;
    prospect.positionRatings.SS = 75;
    const advice = assistantAdvice(s);
    expect(advice.some((a) => a.action?.kind === 'swap' && a.action.upId === prospect.id)).toBe(true);
  });

  it('handles the offseason stages on request', () => {
    const s = state(42);
    s.league.phase = 'offseason';
    s.league.offseason = 'review';
    for (const p of s.players.filter((x) => x.teamId === 0).slice(0, 6)) {
      p.contract = { salary: 2000, years: 1 };
      p.experience = 7;
    }
    advanceOffseason(s); // -> resign
    assistantHandleStage(s);
    expect(expiringFor(s, 0)).toHaveLength(0);
    advanceOffseason(s); // -> free agency
    assistantHandleStage(s);
    advanceOffseason(s); // -> draft
    assistantHandleStage(s);
    expect(s.league.draft!.current).toBe(s.league.draft!.picks.length);
  });
});
