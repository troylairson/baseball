import { isPitcher, overall } from '../model/ratings';
import type { Player } from '../model/types';
import { contractDemand, contractStatus, EXTENSION_THRESHOLD, extensionWillingness } from './contracts';
import {
  bestSigningFor, expiringFor, letPlayerGo, payroll, payrollBudget, resignPlayer, runDraft,
} from './offseason';
import { makeOffer } from './market';
import type { SeasonState } from './season';
import { staffCost } from './staff';

export type AdviceAction =
  | { kind: 'swap'; upId: number; downId: number }
  | { kind: 'sign'; playerId: number }
  | { kind: 'extend'; playerId: number };

export interface Advice {
  id: string;
  title: string;
  body: string;
  action?: AdviceAction;
}

const name = (p: Player) => `${p.firstName} ${p.lastName}`;

/** Clearly better minor leaguer than the weakest comparable big leaguer, if any. */
function promotionCandidate(org: Player[]): { up: Player; down: Player } | null {
  const healthy = org.filter((p) => !p.injury);
  const mlb = healthy.filter((p) => p.level === 'MLB');
  const aaa = healthy.filter((p) => p.level === 'AAA');
  let best: { up: Player; down: Player; gain: number } | null = null;
  for (const up of aaa) {
    const peers = mlb.filter((p) => (isPitcher(up) ? p.position === up.position : !isPitcher(p) && (p.position === up.position || p.position === 'DH')));
    if (!peers.length) continue;
    const down = peers.sort((a, b) => overall(a) - overall(b))[0]!;
    const gain = overall(up) - overall(down);
    if (gain >= 4 && (!best || gain > best.gain)) best = { up, down, gain };
  }
  return best;
}

/** A few concrete suggestions for the user's front office right now. */
export function assistantAdvice(state: SeasonState): Advice[] {
  const { league } = state;
  const team = state.teams.find((t) => t.id === state.userTeamId)!;
  const org = state.players.filter((p) => p.teamId === team.id && !p.retired);
  const advice: Advice[] = [];

  const promo = promotionCandidate(org);
  if (promo && league.phase !== 'offseason') {
    advice.push({
      id: `swap-${promo.up.id}`,
      title: `Call up ${name(promo.up)}`,
      body: `${promo.up.position} in AAA rates ${overall(promo.up)}, ahead of ${name(promo.down)} (${overall(promo.down)}) on the active roster.`,
      action: { kind: 'swap', upId: promo.up.id, downId: promo.down.id },
    });
  }

  if (league.phase === 'regular' || league.phase === 'preseason') {
    const games = team.wins + team.losses;
    const winPct = games ? team.wins / games : 0.5;
    const ext = org
      .filter((p) => p.contract?.years === 1 && overall(p) >= 55 && p.age <= 32 && contractStatus(p) !== 'pre-arb')
      .filter((p) => extensionWillingness(p, winPct) >= EXTENSION_THRESHOLD)
      .sort((a, b) => overall(b) - overall(a))[0];
    if (ext) {
      advice.push({
        id: `extend-${ext.id}`,
        title: `Extend ${name(ext)}`,
        body: `Final year of his deal and he's open to staying. Locking him up avoids losing him to free agency.`,
        action: { kind: 'extend', playerId: ext.id },
      });
    }
  }

  if (league.phase !== 'playoffs' && !league.market) {
    const fa = bestSigningFor(state, team);
    if (fa) {
      advice.push({
        id: `sign-${fa.id}`,
        title: `Sign ${name(fa)}`,
        body: `Free agent ${fa.position}, ${fa.age}, rated ${overall(fa)} — an upgrade that fits the budget.`,
        action: { kind: 'sign', playerId: fa.id },
      });
    }
  }

  const spend = payroll(state.players, team.id) + staffCost(league, team);
  if (spend > payrollBudget(team)) {
    advice.push({
      id: 'budget',
      title: 'Get back under budget',
      body: `You're over the owner's budget. Consider trading a big contract or lowering the scouting budget.`,
    });
  }
  return advice.slice(0, 4);
}

/** Let the assistant make the user's decisions for the current offseason stage. */
export function assistantHandleStage(state: SeasonState): string[] {
  const { league } = state;
  const team = state.teams.find((t) => t.id === state.userTeamId)!;
  const done: string[] = [];
  if (league.offseason === 'resign') {
    for (const p of expiringFor(state, team.id)) {
      const ovr = overall(p);
      const keep = p.expiring === 'arbitration'
        ? ovr >= 46 || overall(p, true) >= 55
        : ovr >= 50 && p.age <= 33 && (p.demand?.salary ?? 0) <= payrollBudget(team) - payroll(state.players, team.id) + (p.contract?.salary ?? 0);
      if (keep && resignPlayer(state, p.id)) done.push(`Kept ${name(p)}`);
      else {
        letPlayerGo(state, p.id);
        done.push(`Let ${name(p)} go`);
      }
    }
  } else if (league.offseason === 'freeAgency') {
    // Bid on the best fits at their asking price; the market decides at the end of the round.
    const taken = new Set((league.market?.offers ?? []).map((o) => o.playerId));
    for (let i = 0; i < 2; i++) {
      const fa = bestSigningFor(state, team, taken);
      if (!fa) break;
      taken.add(fa.id);
      const ask = fa.demand ?? contractDemand(fa);
      if (makeOffer(state, { playerId: fa.id, teamId: team.id, salary: ask.salary, years: ask.years }).ok) done.push(`Offered ${name(fa)} ${ask.years} yr at $${(ask.salary / 1000).toFixed(1)}M`);
    }
  } else if (league.offseason === 'draft') {
    runDraft(state, true);
    done.push('Made your draft picks');
  }
  return done;
}
