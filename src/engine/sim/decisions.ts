import { battingOverall, pitchingOverall } from '../model/ratings';
import type { Player } from '../model/types';
import { pitchLimit, RELIEVER_TIRED, stealTarget, type LiveCommand, type LiveSituation } from './game';
import type { GamePlan } from './lineup';

/**
 * The manager's assistant for live games: standing orders it carries out
 * without asking, and the moments worth stopping for (with its own
 * recommendation), so a game takes a handful of decisions rather than a tap
 * per batter. Pure functions of the situation, so they're easy to test.
 */

export interface LiveOrders {
  /** Send runners with at least this speed to second (third needs 10 more); null: never automatically. */
  stealSpeed: number | null;
  /** Pull the starter at this pitch count; null: the coaching staff decides. */
  starterPitchLimit: number | null;
  /** Closer starts the 9th with a 1–3 run lead. */
  closerInSave: boolean;
  /** Pinch-hit for the pitcher from the 6th inning on in a close game (no DH). */
  pinchHitForPitcher: boolean;
  /** Which moments stop "play to next decision". */
  stops: Record<DecisionKind, boolean>;
}

export type DecisionKind = 'pitching' | 'pinchHit' | 'steal' | 'bunt' | 'walk' | 'bigMoment';

export const DEFAULT_ORDERS: LiveOrders = {
  stealSpeed: 70,
  starterPitchLimit: null,
  closerInSave: true,
  pinchHitForPitcher: true,
  stops: { pitching: true, pinchHit: true, steal: true, bunt: true, walk: true, bigMoment: true },
};

/** Fill in orders saved by an older version. */
export function withDefaults(orders: Partial<LiveOrders> | undefined): LiveOrders {
  return { ...DEFAULT_ORDERS, ...orders, stops: { ...DEFAULT_ORDERS.stops, ...orders?.stops } };
}

export interface Decision {
  /** Identifies this moment, so "keep going" doesn't stop on it again. */
  key: string;
  kind: DecisionKind;
  title: string;
  detail: string;
  /** The assistant's call, ready to do in one tap. */
  suggestion?: { label: string; command: LiveCommand };
}

export interface DecisionContext {
  players: Map<number, Player>;
  /** The manager's own game plan (bullpen roles). */
  plan: GamePlan;
  orders: LiveOrders;
}

const last = (p: Player) => p.lastName;

/** The manager's team's lead (negative when behind). */
export function userLead(s: LiveSituation): number {
  const userAway = s.userBatting ? s.half === 'top' : s.half === 'bottom';
  return userAway ? s.awayRuns - s.homeRuns : s.homeRuns - s.awayRuns;
}

/** A hitter's value against this pitcher, with the platoon edge. */
export function hitterValue(p: Player, throws: Player['throws']): number {
  const edge = p.bats === 'S' ? 1 : p.bats === throws ? -2.5 : 2.5;
  return battingOverall(p.batting) + edge;
}

/** The pitcher is due up (a pinch hitter who took his spot doesn't count). */
const pitcherBatting = (s: LiveSituation, ctx: DecisionContext) => !!ctx.players.get(s.batterId)?.pitching;

const stealOdds = (speed: number, to: 2 | 3) => 0.72 + (speed - 55) * 0.007 - (to === 3 ? 0.04 : 0);

function bestPinchHitter(s: LiveSituation, ctx: DecisionContext, pitcher: Player): Player | undefined {
  return s.bench
    .map((id) => ctx.players.get(id)!)
    .filter(Boolean)
    .sort((a, b) => hitterValue(b, pitcher.throws) - hitterValue(a, pitcher.throws))[0];
}

/** The reliever the assistant would bring in now. */
export function bestReliever(s: LiveSituation, ctx: DecisionContext): Player | undefined {
  const lead = userLead(s);
  const fresh = (id: number | null) => {
    if (id === null || !s.bullpen.includes(id)) return undefined;
    const p = ctx.players.get(id);
    return p && p.fatigue < RELIEVER_TIRED ? p : undefined;
  };
  if (s.inning >= 9 && lead >= 1 && lead <= 3) {
    const closer = fresh(ctx.plan.closer);
    if (closer) return closer;
  }
  if (s.inning >= 8 && lead >= 0 && lead <= 3) {
    const setup = ctx.plan.setup.map(fresh).find(Boolean);
    if (setup) return setup;
  }
  const middle = ctx.plan.middle.map(fresh).filter((p): p is Player => !!p);
  if (middle.length) return Math.abs(lead) >= 5 ? middle[middle.length - 1] : middle[0];
  return s.bullpen
    .map((id) => ctx.players.get(id)!)
    .filter((p) => p && p.fatigue < RELIEVER_TIRED)
    .sort((a, b) => pitchingOverall(b.pitching!, false) - pitchingOverall(a.pitching!, false))[0];
}

/** What a standing order does here without asking, if anything. */
export function standingOrder(s: LiveSituation, ctx: DecisionContext): LiveCommand | null {
  const { orders } = ctx;
  if (!s.userBatting) return null;
  const pitcher = ctx.players.get(s.pitcherId);
  if (orders.pinchHitForPitcher && pitcherBatting(s, ctx) && s.inning >= 6 && Math.abs(userLead(s)) <= 3 && pitcher) {
    const ph = bestPinchHitter(s, ctx, pitcher);
    if (ph) return { type: 'pinchHit', playerId: ph.id };
  }
  const to = stealTarget(s.bases);
  if (orders.stealSpeed !== null && to !== null && s.outs < 2) {
    const runner = ctx.players.get(s.bases[to - 2]!);
    if (runner && runner.batting.speed >= orders.stealSpeed + (to === 3 ? 10 : 0)) return { type: 'steal' };
  }
  return null;
}

/** A moment worth stopping for, with the assistant's call; null to keep playing. */
export function findDecision(s: LiveSituation, ctx: DecisionContext): Decision | null {
  const { players, orders } = ctx;
  const stops = orders.stops;
  const lead = userLead(s);
  const late = s.inning >= 7;
  const close = Math.abs(lead) <= 2;
  const batter = players.get(s.batterId);
  const pitcher = players.get(s.pitcherId);
  if (!batter || !pitcher) return null;
  const half = `${s.inning}${s.half[0]}`;
  const risp = s.bases[1] !== null || s.bases[2] !== null;

  if (!s.userBatting) {
    // --- Your pitcher -------------------------------------------------------
    if (stops.pitching) {
      const relief = bestReliever(s, ctx);
      const bring = relief && { label: `Bring in ${last(relief)}`, command: { type: 'pitchingChange', playerId: relief.id } as LiveCommand };
      const save = s.inning >= 9 && lead >= 1 && lead <= 3;
      if (save && s.pitcherRole !== 'CL' && s.outs === 0 && !s.bases.some((b) => b !== null) && relief && relief.id === ctx.plan.closer) {
        return { key: `save-${half}`, kind: 'pitching', title: 'Save situation', detail: `Up ${lead} in the ${s.inning}th. ${last(relief)} is your closer.`, suggestion: bring };
      }
      if (s.pitcherRole === 'SP') {
        const limit = orders.starterPitchLimit ?? pitchLimit(pitcher, true);
        if (s.pitcherPitches >= limit - 15) {
          return {
            key: `tired-${pitcher.id}-${half}`, kind: 'pitching', title: `${last(pitcher)} is tiring`,
            detail: `${s.pitcherPitches} pitches${s.pitcherLine.r ? `, ${s.pitcherLine.r} run${s.pitcherLine.r > 1 ? 's' : ''} allowed` : ''}.`, suggestion: bring,
          };
        }
        if (s.pitcherLine.r >= 4 && s.bases.some((b) => b !== null)) {
          return { key: `trouble-${pitcher.id}-${s.pitcherLine.r}`, kind: 'pitching', title: `${last(pitcher)} is in trouble`, detail: `${s.pitcherLine.r} runs allowed and men on base.`, suggestion: bring };
        }
        if (s.pitcherLine.bf >= 18 && s.pitcherLine.bf <= 20 && s.inning >= 5) {
          return {
            key: `tto-${pitcher.id}`, kind: 'pitching', title: 'Third time through the order',
            detail: `Hitters do better each time they see ${last(pitcher)}. He's at ${s.pitcherPitches} pitches.`, suggestion: bring,
          };
        }
      } else if (s.pitcherLine.r >= 2 && s.bases.some((b) => b !== null) && late && close) {
        return { key: `rp-${pitcher.id}-${s.pitcherLine.r}`, kind: 'pitching', title: `${last(pitcher)} is struggling`, detail: `${s.pitcherLine.r} runs in and men on base.`, suggestion: bring };
      }
    }
    // --- Walk a dangerous hitter -----------------------------------------
    const onDeck = players.get(s.onDeckId);
    if (stops.walk && s.inning >= 8 && Math.abs(lead) <= 1 && s.bases[0] === null && risp && onDeck
      && battingOverall(batter.batting) - battingOverall(onDeck.batting) >= 8) {
      return {
        key: `ibb-${batter.id}-${half}`, kind: 'walk', title: `Walk ${last(batter)}?`,
        detail: `First base is open and ${last(onDeck)} on deck is a much weaker hitter.`, suggestion: { label: `Walk ${last(batter)}`, command: { type: 'ibb' } },
      };
    }
    if (stops.bigMoment && s.inning >= 8 && Math.abs(lead) <= 1 && risp) {
      return { key: `big-${half}-${batter.id}`, kind: 'bigMoment', title: 'Big spot', detail: `${lead > 0 ? 'Tying' : 'Go-ahead'} run in scoring position, ${s.outs} out.` };
    }
    return null;
  }

  // --- Your hitters -----------------------------------------------------------
  const forPitcher = pitcherBatting(s, ctx);
  if (stops.pinchHit && ((late && Math.abs(lead) <= 3) || (forPitcher && s.inning >= 6))) {
    const ph = bestPinchHitter(s, ctx, pitcher);
    if (ph && (forPitcher || hitterValue(ph, pitcher.throws) - hitterValue(batter, pitcher.throws) >= 5)) {
      const hand = ph.bats === 'S' ? 'switch-hitter' : `bats ${ph.bats}`;
      return {
        key: `ph-${batter.id}-${pitcher.id}-${half}`, kind: 'pinchHit', title: `Pinch-hit for ${last(batter)}?`,
        detail: `${last(ph)} (${hand}) is a better bet against ${last(pitcher)} (throws ${pitcher.throws}).`,
        suggestion: { label: `Pinch-hit ${last(ph)}`, command: { type: 'pinchHit', playerId: ph.id } },
      };
    }
  }
  if (stops.bunt && s.inning >= 8 && lead >= -1 && lead <= 0 && s.outs === 0 && s.bases[2] === null && (s.bases[0] !== null || s.bases[1] !== null)
    && battingOverall(batter.batting) < 47) {
    return {
      key: `bunt-${batter.id}-${half}`, kind: 'bunt', title: 'Bunt them over?',
      detail: `${lead === 0 ? 'Tie game' : 'Down one'}, nobody out, and ${last(batter)} isn't much of a hitter.`, suggestion: { label: 'Sacrifice bunt', command: { type: 'bunt' } },
    };
  }
  const to = stealTarget(s.bases);
  if (stops.steal && to !== null && Math.abs(lead) <= 4) {
    const runner = players.get(s.bases[to - 2]!);
    const odds = runner ? stealOdds(runner.batting.speed, to) : 0;
    if (runner && odds >= 0.75 && (s.outs < 2 || to === 2)) {
      return {
        key: `steal-${runner.id}-${to}-${half}`, kind: 'steal', title: `Send ${last(runner)}?`,
        detail: `Speed ${runner.batting.speed}: he makes it about ${Math.round(Math.min(0.95, odds) * 100)}% of the time.`,
        suggestion: { label: to === 3 ? 'Steal 3rd' : 'Steal 2nd', command: { type: 'steal' } },
      };
    }
  }
  if (stops.bigMoment && late && Math.abs(lead) <= 1 && risp && s.inning >= 8) {
    return { key: `big-${half}-${batter.id}`, kind: 'bigMoment', title: 'Big spot', detail: `${lead < 0 ? 'Tying' : lead === 0 ? 'Go-ahead' : 'Insurance'} run in scoring position, ${s.outs} out.` };
  }
  return null;
}
