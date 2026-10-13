import { overall } from '../model/ratings';
import type { League, Player, Team } from '../model/types';

export const DRAFT_ROUNDS = 4;

/** A pick in an upcoming draft, identified by the team it originally belonged to. */
export interface PickRef {
  season: number;
  round: number;
  originalTeamId: number;
}

export const pickId = (p: PickRef) => `${p.season}-${p.round}-${p.originalTeamId}`;

export function parsePickId(id: string): PickRef {
  const [season, round, originalTeamId] = id.split('-').map(Number);
  return { season: season!, round: round!, originalTeamId: originalTeamId! };
}

export function pickOwner(league: League, id: string): number {
  return league.pickOwners?.[id] ?? parsePickId(id).originalTeamId;
}

/** Picks can be traded until that draft begins. */
export function picksTradeable(league: League): boolean {
  return !(league.phase === 'offseason' && league.offseason === 'draft');
}

/** The upcoming draft's picks a team currently owns. */
export function picksOwnedBy(league: League, teams: Team[], teamId: number): PickRef[] {
  if (!picksTradeable(league)) return [];
  const out: PickRef[] = [];
  for (let round = 1; round <= DRAFT_ROUNDS; round++) {
    for (const t of teams) {
      const ref = { season: league.season, round, originalTeamId: t.id };
      if (pickOwner(league, pickId(ref)) === teamId) out.push(ref);
    }
  }
  return out;
}

/**
 * Where a team's pick is likely to land (1 = first overall): worst record
 * picks first. Early in a season, roster strength stands in for the record.
 */
export function projectedSlot(teams: Team[], originalTeamId: number, players?: Player[]): number {
  const games = Math.min(...teams.map((t) => t.wins + t.losses));
  let key: (t: Team) => number;
  if (games < 20 && players) {
    const strength = new Map(teams.map((t) => {
      const roster = players.filter((p) => p.teamId === t.id && p.level === 'MLB' && !p.retired);
      return [t.id, roster.reduce((s, p) => s + overall(p), 0) / Math.max(1, roster.length)];
    }));
    key = (t) => strength.get(t.id)!;
  } else {
    key = (t) => (t.wins + t.losses ? t.wins / (t.wins + t.losses) : 0.5) + (t.runsScored - t.runsAllowed) / 1e5;
  }
  const order = [...teams].sort((a, b) => key(a) - key(b));
  return order.findIndex((t) => t.id === originalTeamId) + 1;
}

/**
 * Trade value of a pick on the same scale as playerValue: an early first
 * rounder is worth about a top prospect; later rounds fall off fast.
 * Rebuilders love picks; contenders discount them.
 */
export function pickValue(teams: Team[], ref: PickRef, contending: boolean, players?: Player[]): number {
  const slot = projectedSlot(teams, ref.originalTeamId, players);
  const base = ref.round === 1 ? 150 * (1 - ((slot - 1) / teams.length) * 0.6) : ref.round === 2 ? 45 : ref.round === 3 ? 18 : 8;
  return base * (contending ? 0.6 : 1.2);
}

export function pickLabel(teams: Team[], ref: PickRef, ownerId?: number, players?: Player[]): string {
  const orig = teams.find((t) => t.id === ref.originalTeamId);
  const suffix = ownerId !== undefined && ownerId !== ref.originalTeamId ? ` (from ${orig?.abbr ?? '?'})` : '';
  const proj = ref.round === 1 ? ` · proj. #${projectedSlot(teams, ref.originalTeamId, players)}` : '';
  return `${ref.season} round ${ref.round}${suffix}${proj}`;
}
