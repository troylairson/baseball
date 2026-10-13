import type { Player, Team } from '../model/types';
import type { SeasonState } from './season';

/**
 * Team chemistry: how well a clubhouse gets along. It comes from veteran
 * leaders, troublemakers, how happy the players are, winning, and how many
 * new faces have arrived. Good chemistry gives a small lift on the field and
 * to morale; a toxic clubhouse does the opposite.
 */

export const NEUTRAL_CHEMISTRY = 50;

export interface ChemistryFactor {
  label: string;
  /** Points added to (or taken from) a neutral 50. */
  value: number;
  playerIds?: number[];
}

export type ClubhouseRole = 'leader' | 'bad-apple' | null;

const MAX_LEADERS = 3;
const MAX_BAD_APPLES = 3;

/** Respected veterans who hold a clubhouse together. */
export const isLeader = (p: Player) => p.personality.leadership >= 65 && p.age >= 28;
/** Greedy, low-effort players who drag others down. */
export const isBadApple = (p: Player) => p.personality.greed >= 65 && p.personality.workEthic <= 40;

export function clubhouseRole(p: Player): ClubhouseRole {
  if (isBadApple(p)) return 'bad-apple';
  if (isLeader(p)) return 'leader';
  return null;
}

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;
const list = (ps: Player[]) => ps.map(fullName).join(', ');

export function chemistryFactors(state: Pick<SeasonState, 'teams' | 'players'>, teamId: number): ChemistryFactor[] {
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return [];
  const active = state.players.filter((p) => p.teamId === teamId && p.level === 'MLB' && !p.retired);
  const factors: ChemistryFactor[] = [];

  const leaders = active.filter(isLeader).sort((a, b) => b.personality.leadership - a.personality.leadership).slice(0, MAX_LEADERS);
  if (leaders.length) factors.push({ label: `Veteran leadership: ${list(leaders)}`, value: leaders.length * 4, playerIds: leaders.map((p) => p.id) });

  const apples = active.filter(isBadApple).slice(0, MAX_BAD_APPLES);
  if (apples.length) factors.push({ label: `Clubhouse troublemakers: ${list(apples)}`, value: -apples.length * 5, playerIds: apples.map((p) => p.id) });

  const wantOut = active.filter((p) => p.tradeRequested);
  if (wantOut.length) factors.push({ label: `Players asking to be traded: ${list(wantOut)}`, value: -wantOut.length * 3, playerIds: wantOut.map((p) => p.id) });

  if (active.length) {
    const mood = active.reduce((s, p) => s + (p.morale ?? 50), 0) / active.length;
    const v = Math.round((mood - 50) * 0.35);
    if (Math.abs(v) >= 2) factors.push({ label: v > 0 ? 'A happy group' : 'An unhappy group', value: v });
  }

  const games = team.wins + team.losses;
  if (games >= 10) {
    const v = Math.round((team.wins / games - 0.5) * 20);
    if (Math.abs(v) >= 2) factors.push({ label: v > 0 ? 'Winning breeds belief' : 'Losing wears on everyone', value: v });
  }

  if (team.core?.length) {
    const core = new Set(team.core);
    const newcomers = active.filter((p) => !core.has(p.id));
    if (newcomers.length >= 9) factors.push({ label: `Lots of new faces (${newcomers.length})`, value: -Math.min(8, Math.round((newcomers.length - 8) * 1.5)) });
    else if (newcomers.length <= 4) factors.push({ label: 'A settled roster', value: 4 });
  }
  return factors;
}

export function chemistryTarget(state: Pick<SeasonState, 'teams' | 'players'>, teamId: number): number {
  const sum = chemistryFactors(state, teamId).reduce((s, f) => s + f.value, 0);
  return Math.max(10, Math.min(90, NEUTRAL_CHEMISTRY + sum));
}

/** Drift each team's chemistry toward its target (weekly, alongside morale). */
export function updateChemistry(state: Pick<SeasonState, 'teams' | 'players'>): void {
  for (const team of state.teams) {
    const target = chemistryTarget(state, team.id);
    const current = team.chemistry ?? target;
    team.chemistry = Math.round(current + (target - current) * 0.35);
  }
}

/** Rating points every player on the team gains (or loses) in games. */
export function chemistryRatingBonus(team: Pick<Team, 'chemistry'>): number {
  const c = team.chemistry ?? NEUTRAL_CHEMISTRY;
  return Math.max(-1, Math.min(1, (c - NEUTRAL_CHEMISTRY) / 35));
}

export function chemistryLabel(chemistry: number | undefined): 'Great' | 'Good' | 'Neutral' | 'Tense' | 'Toxic' {
  const c = chemistry ?? NEUTRAL_CHEMISTRY;
  return c >= 70 ? 'Great' : c >= 58 ? 'Good' : c >= 42 ? 'Neutral' : c >= 30 ? 'Tense' : 'Toxic';
}

/** Remember who finished the season on each club, to measure turnover next year. */
export function snapshotCores(state: Pick<SeasonState, 'teams' | 'players'>): void {
  for (const team of state.teams) {
    team.core = state.players.filter((p) => p.teamId === team.id && p.level === 'MLB' && !p.retired).map((p) => p.id);
  }
}
