import { arsenalOf } from '../model/pitches';
import type { Player } from '../model/types';
import { addNews } from './news';
import { marketBudget, setOwnerTargets } from './offseason';
import { ensureStaff } from './staff';
import { ensureFinances, openingBudget } from './finance';
import type { SeasonState } from './season';

/**
 * Fill in league/player fields added after a save was created, and set up
 * a brand-new career. Safe to call repeatedly.
 */
export function ensureCareerDefaults(state: SeasonState): void {
  const { league } = state;
  league.history ??= [];
  league.news ??= [];
  league.nextNewsId ??= 1;
  league.playoffs ??= null;
  league.offseason ??= null;
  league.draft ??= null;
  ensureStaff(league, state.teams, state.seed);
  ensureFinances(state);
  for (const t of state.teams) {
    if (t.budget === undefined) {
      const pay = state.players.filter((p) => p.teamId === t.id && !p.retired).reduce((s, p) => s + (p.contract?.salary ?? 0), 0);
      t.budget = Math.max(marketBudget(t.market), openingBudget(pay, t.market));
    }
  }
  for (const p of state.players as Player[]) {
    p.experience ??= p.level === 'MLB' ? Math.max(0, p.age - 23) : 0;
    arsenalOf(p);
  }
  if (!league.owner) {
    setOwnerTargets(state);
    const team = state.teams.find((t) => t.id === state.userTeamId)!;
    addNews(league, {
      kind: 'owner',
      title: `Welcome to the ${team.city} ${team.name}`,
      body: `The owner's goal for ${league.season}: ${league.owner!.expectation.toLowerCase()} (about ${league.owner!.targetWins} wins).`,
      mine: true,
    });
  }
}
