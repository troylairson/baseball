import { overall, type Player, type Team } from '../engine';

export function mlbRoster(players: Player[], teamId: number): Player[] {
  return players.filter((p) => p.teamId === teamId && p.level === 'MLB');
}

export function teamOverall(players: Player[], teamId: number): number {
  const roster = mlbRoster(players, teamId);
  return Math.round(roster.reduce((s, p) => s + overall(p), 0) / Math.max(1, roster.length));
}

export function payroll(players: Player[], teamId: number): number {
  return players.filter((p) => p.teamId === teamId).reduce((s, p) => s + (p.contract?.salary ?? 0), 0);
}

/** Owner's payroll budget in $K, driven by market size. */
export function payrollBudget(team: Team): number {
  return 60000 + team.market * 25000;
}

export function winPct(t: Team): number {
  const g = t.wins + t.losses;
  return g === 0 ? 0 : t.wins / g;
}

export function standingsSort(a: Team, b: Team): number {
  return winPct(b) - winPct(a) || b.wins - a.wins || a.city.localeCompare(b.city);
}

export function gamesBack(leader: Team, t: Team): string {
  const gb = (leader.wins - t.wins + (t.losses - leader.losses)) / 2;
  return gb === 0 ? '—' : gb.toFixed(1).replace(/\.0$/, '');
}
