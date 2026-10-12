import { battingOverall, pitchingOverall } from '../model/ratings';
import { FIELD_POSITIONS, type FieldPosition, type Player } from '../model/types';

export interface LineupSlot {
  playerId: number;
  /** Defensive position, or 'DH' / 'P' for the designated hitter / pitcher batting. */
  position: FieldPosition | 'DH' | 'P';
}

export interface GamePlan {
  /** Nine batters in batting order. With no DH, the pitcher's slot uses position 'P'. */
  lineup: LineupSlot[];
  rotation: number[];
  closer: number | null;
  setup: number[];
  /** Remaining relievers, best first. */
  middle: number[];
}

/** Fill the scarcest, most demanding positions first. */
const FILL_ORDER: FieldPosition[] = ['C', 'SS', 'CF', '2B', '3B', 'RF', 'LF', '1B'];
const DEFENSE_VALUE: Record<FieldPosition, number> = { C: 0.45, SS: 0.45, CF: 0.4, '2B': 0.35, '3B': 0.3, RF: 0.25, LF: 0.2, '1B': 0.1 };

/** Defensive rating at a position; players out of position play well below their glove. */
export function defenseAt(p: Player, pos: FieldPosition): number {
  return p.positionRatings[pos] ?? Math.max(20, p.fielding.defense - (pos === 'C' ? 30 : pos === 'SS' || pos === 'CF' ? 18 : 12));
}

const pitchVal = (p: Player, starter: boolean) => (p.pitching ? pitchingOverall(p.pitching, starter) : 0);

/** Build an automatic lineup and pitching staff from a team's active roster. */
export function autoPlan(roster: Player[], useDH: boolean): GamePlan {
  const hitters = roster.filter((p) => p.position !== 'SP' && p.position !== 'RP');
  const pitchers = roster.filter((p) => p.position === 'SP' || p.position === 'RP');

  const assigned = new Map<FieldPosition, Player>();
  const used = new Set<number>();
  for (const pos of FILL_ORDER) {
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const p of hitters) {
      if (used.has(p.id)) continue;
      const score = battingOverall(p.batting) * (1 - DEFENSE_VALUE[pos]) + defenseAt(p, pos) * DEFENSE_VALUE[pos]
        + (p.positionRatings[pos] !== undefined ? 3 : 0);
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
    if (best) {
      assigned.set(pos, best);
      used.add(best.id);
    }
  }

  const starters = FIELD_POSITIONS.filter((pos) => assigned.has(pos)).map((pos) => ({ player: assigned.get(pos)!, position: pos as LineupSlot['position'] }));
  if (useDH) {
    const dh = hitters.filter((p) => !used.has(p.id)).sort((a, b) => battingOverall(b.batting) - battingOverall(a.batting))[0];
    if (dh) starters.push({ player: dh, position: 'DH' });
  }

  const rotation = pitchers
    .filter((p) => p.position === 'SP')
    .sort((a, b) => pitchVal(b, true) - pitchVal(a, true))
    .slice(0, 5)
    .map((p) => p.id);
  const bullpen = pitchers
    .filter((p) => !rotation.includes(p.id))
    .sort((a, b) => pitchVal(b, false) - pitchVal(a, false))
    .map((p) => p.id);

  return {
    lineup: battingOrder(starters),
    rotation,
    closer: bullpen[0] ?? null,
    setup: bullpen.slice(1, 3),
    middle: bullpen.slice(3),
  };
}

/** Classic order: on-base skills up top, best bats 2–4, then descending. */
function battingOrder(starters: { player: Player; position: LineupSlot['position'] }[]): LineupSlot[] {
  const onBase = (p: Player) => p.batting.contact * 0.5 + p.batting.eye * 0.4 + p.batting.speed * 0.1;
  const byBat = [...starters].sort((a, b) => battingOverall(b.player.batting) - battingOverall(a.player.batting));
  const top = byBat.slice(0, 4);
  const leadoff = [...top].sort((a, b) => onBase(b.player) - onBase(a.player))[0];
  const order = [leadoff, ...byBat.filter((s) => s !== leadoff)].filter((s): s is NonNullable<typeof s> => !!s);
  return order.map((s) => ({ playerId: s.player.id, position: s.position }));
}
