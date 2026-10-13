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

/** Value of a hitter at a defensive position, blending bat and glove. */
export function fitAt(p: Player, pos: FieldPosition | 'DH'): number {
  if (pos === 'DH') return battingOverall(p.batting);
  return battingOverall(p.batting) * (1 - DEFENSE_VALUE[pos]) + defenseAt(p, pos) * DEFENSE_VALUE[pos]
    + (p.positionRatings[pos] !== undefined ? 3 : 0);
}

function bestAt(pos: FieldPosition | 'DH', hitters: Player[], used: Set<number>): Player | null {
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const p of hitters) {
    if (used.has(p.id)) continue;
    const score = fitAt(p, pos);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Sit platooned hitters against a starter of the hand they struggle with:
 * each is replaced at his position by the best available bench bat.
 */
export function platoonLineup(plan: GamePlan, roster: Player[], sit: number[]): GamePlan {
  if (!sit.length) return plan;
  const sitting = new Set(sit);
  if (!plan.lineup.some((s) => sitting.has(s.playerId))) return plan;
  const hitters = roster.filter((p) => p.position !== 'SP' && p.position !== 'RP' && !sitting.has(p.id));
  const used = new Set(plan.lineup.map((s) => s.playerId));
  const lineup = plan.lineup.map((slot) => {
    if (!sitting.has(slot.playerId) || slot.position === 'P') return slot;
    const sub = bestAt(slot.position, hitters, used);
    if (!sub) return slot;
    used.add(sub.id);
    return { ...slot, playerId: sub.id };
  });
  return { ...plan, lineup };
}

const pitchVal = (p: Player, starter: boolean) => (p.pitching ? pitchingOverall(p.pitching, starter) : 0);

/** Build an automatic lineup and pitching staff from a team's active roster. */
export function autoPlan(roster: Player[], useDH: boolean): GamePlan {
  const hitters = roster.filter((p) => p.position !== 'SP' && p.position !== 'RP');
  const pitchers = roster.filter((p) => p.position === 'SP' || p.position === 'RP');

  const assigned = new Map<FieldPosition, Player>();
  const used = new Set<number>();
  for (const pos of FILL_ORDER) {
    const best = bestAt(pos, hitters, used);
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

const isPitcherPos = (p: Player) => p.position === 'SP' || p.position === 'RP';

/**
 * Apply a saved (user) plan to today's roster. Anything that is no longer
 * valid — a player sent down or traded, a missing position — is filled in
 * automatically, so a stale plan never breaks a game.
 */
export function resolvePlan(roster: Player[], saved: GamePlan | null | undefined, useDH: boolean): GamePlan {
  const auto = autoPlan(roster, useDH);
  if (!saved) return auto;
  const byId = new Map(roster.map((p) => [p.id, p]));
  const hitters = roster.filter((p) => !isPitcherPos(p));

  // Lineup: keep valid slots in order, then fill missing positions.
  const used = new Set<number>();
  const seenPos = new Set<string>();
  const lineup: LineupSlot[] = [];
  for (const slot of saved.lineup) {
    const p = byId.get(slot.playerId);
    if (!p || isPitcherPos(p) || slot.position === 'P' || used.has(p.id) || seenPos.has(slot.position)) continue;
    if (slot.position === 'DH' && !useDH) continue;
    lineup.push(slot);
    used.add(p.id);
    seenPos.add(slot.position);
  }
  const needed: (FieldPosition | 'DH')[] = [...FILL_ORDER, ...(useDH ? (['DH'] as const) : [])].filter((pos) => !seenPos.has(pos));
  for (const pos of needed) {
    const p = bestAt(pos, hitters, used);
    if (!p) continue;
    lineup.push({ playerId: p.id, position: pos });
    used.add(p.id);
  }

  // Pitching staff: keep valid assignments, top up from the automatic plan.
  const pitcherIds = new Set(roster.filter(isPitcherPos).map((p) => p.id));
  const taken = new Set<number>();
  const keep = (id: number | null | undefined) => {
    if (id == null || !pitcherIds.has(id) || taken.has(id)) return null;
    taken.add(id);
    return id;
  };
  const rotation = saved.rotation.map(keep).filter((id): id is number => id !== null).slice(0, 5);
  for (const id of auto.rotation) {
    if (rotation.length >= 5) break;
    if (keep(id) !== null) rotation.push(id);
  }
  const closer = keep(saved.closer);
  const setup = saved.setup.map(keep).filter((id): id is number => id !== null);
  const middle = saved.middle.map(keep).filter((id): id is number => id !== null);
  // Any pitcher not yet placed joins the bullpen, best first.
  for (const id of [auto.closer, ...auto.setup, ...auto.middle, ...auto.rotation]) {
    if (keep(id) !== null) middle.push(id!);
  }
  return { lineup, rotation, closer: closer ?? middle.shift() ?? null, setup, middle };
}
