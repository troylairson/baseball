import { isPitcher, overall } from '../model/ratings';
import type { League, Player, Team, TradeOffer } from '../model/types';
import { playerValue } from './contracts';
import { addNews } from './news';
import { payroll, payrollBudget, teamStrength } from './offseason';
import { fixRoster } from './roster';
import { parsePickId, pickLabel, pickOwner, picksTradeable, pickValue } from './picks';

export interface TradeProposal {
  partnerId: number;
  /** Players the user sends away. */
  give: number[];
  /** Players the user receives. */
  get: number[];
  /** Draft pick ids (see picks.ts) the user sends / receives. */
  givePicks?: string[];
  getPicks?: string[];
}

export interface TradeEvaluation {
  accepted: boolean;
  /** 0–1+: how close the offer is to what the partner needs (≥ 1 = yes). */
  score: number;
  message: string;
  partnerMode: 'contending' | 'rebuilding';
}

interface TradeContext {
  league: League;
  teams: Team[];
  players: Player[];
  userTeamId: number;
}

/** Last day trades are allowed during the regular season. */
export const tradeDeadline = (season: number) => `${season}-07-31`;

export function tradeWindowOpen(league: League): { open: boolean; reason?: string } {
  if (league.phase === 'playoffs') return { open: false, reason: 'Trades are frozen during the playoffs.' };
  if (league.phase === 'regular' && league.date > tradeDeadline(league.season)) {
    return { open: false, reason: 'The trade deadline has passed. Trading reopens in the offseason.' };
  }
  return { open: true };
}

/** Contenders value present ability; rebuilders value youth and upside. */
export function teamMode(ctx: TradeContext, teamId: number): 'contending' | 'rebuilding' {
  const team = ctx.teams.find((t) => t.id === teamId)!;
  const games = team.wins + team.losses;
  if (ctx.league.phase === 'regular' && games >= 40) {
    return team.wins / games >= 0.5 ? 'contending' : 'rebuilding';
  }
  const ranked = [...ctx.teams].sort((a, b) => teamStrength(ctx.players, b.id) - teamStrength(ctx.players, a.id));
  return ranked.findIndex((t) => t.id === teamId) < ctx.teams.length / 2 ? 'contending' : 'rebuilding';
}

const sumValue = (list: Player[], contending: boolean) => list.reduce((s, p) => s + playerValue(p, contending), 0);
const salaries = (list: Player[]) => list.reduce((s, p) => s + (p.contract?.salary ?? 0), 0);

export function evaluateTrade(ctx: TradeContext, proposal: TradeProposal): TradeEvaluation {
  const byId = new Map(ctx.players.map((p) => [p.id, p]));
  const give = proposal.give.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  const get = proposal.get.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  const mode = teamMode(ctx, proposal.partnerId);
  const contending = mode === 'contending';
  const no = (message: string, score = 0): TradeEvaluation => ({ accepted: false, score, message, partnerMode: mode });

  const givePicks = proposal.givePicks ?? [];
  const getPicks = proposal.getPicks ?? [];
  const window = tradeWindowOpen(ctx.league);
  if (!window.open) return no(window.reason!);
  if (give.length + givePicks.length === 0 && get.length + getPicks.length === 0) return no('Add players or picks to build a deal.');
  if (give.some((p) => p.teamId !== ctx.userTeamId) || get.some((p) => p.teamId !== proposal.partnerId)) {
    return no('Those players are no longer available.');
  }
  if ((givePicks.length || getPicks.length) && !picksTradeable(ctx.league)) return no('Picks can’t be traded once the draft has started.');
  if (givePicks.some((id) => pickOwner(ctx.league, id) !== ctx.userTeamId) || getPicks.some((id) => pickOwner(ctx.league, id) !== proposal.partnerId)) {
    return no('Those picks are no longer available.');
  }
  if (get.length + getPicks.length === 0) return no('Ask for at least one of their players or picks.');

  // Roster sanity for the partner: never leave them without starters or catchers.
  const partnerOrg = ctx.players.filter((p) => p.teamId === proposal.partnerId && !p.retired);
  const after = [...partnerOrg.filter((p) => !proposal.get.includes(p.id)), ...give];
  if (after.filter((p) => p.position === 'SP').length < 6) return no("They can't give up that much starting pitching.");
  if (after.filter((p) => p.position === 'C').length < 2) return no('They need to keep a catcher.');
  if (after.filter((p) => !isPitcher(p)).length < 14 || after.filter(isPitcher).length < 15) return no('That would leave their roster too thin.');

  // Budget: they won't take on salary they can't afford.
  const partner = ctx.teams.find((t) => t.id === proposal.partnerId)!;
  const newPayroll = payroll(ctx.players, partner.id) - salaries(get) + salaries(give);
  if (salaries(give) > salaries(get) && newPayroll > payrollBudget(partner) * 1.03) {
    return no(`That adds too much salary — they're near their budget.`);
  }

  const picksValue = (ids: string[]) => ids.reduce((sum, id) => sum + pickValue(ctx.teams, parsePickId(id), contending), 0);
  const valueIn = sumValue(give, contending) + picksValue(givePicks);
  const valueOut = sumValue(get, contending) + picksValue(getPicks);
  // AI teams want to win the trade, and value quality over quantity.
  const assetsIn = give.length + givePicks.length;
  const assetsOut = get.length + getPicks.length;
  const depthDiscount = assetsIn > assetsOut ? 0.85 ** (assetsIn - assetsOut) : 1;
  // Harder difficulties make the AI demand a bigger win from every deal.
  const [margin, floor] = ([[1.02, 1], [1.12, 3], [1.25, 5]] as const)[ctx.league.settings.difficulty ?? 1];
  const needed = valueOut * margin + floor;
  const score = (valueIn * depthDiscount) / needed;
  if (score >= 1) return { accepted: true, score, message: 'They would accept this deal.', partnerMode: mode };

  const wants = contending
    ? 'They are contending and want players who help now.'
    : 'They are rebuilding and want young players and prospects.';
  const gap = score >= 0.85 ? 'Close — add a little more.' : score >= 0.6 ? 'Not enough value coming back.' : 'Not interested.';
  return no(`${gap} ${wants}`, score);
}

export type TradeResult = { ok: true } | { ok: false; reason: string };

export function executeTrade(ctx: TradeContext, proposal: TradeProposal): TradeResult {
  const evaluation = evaluateTrade(ctx, proposal);
  if (!evaluation.accepted) return { ok: false, reason: evaluation.message };
  const byId = new Map(ctx.players.map((p) => [p.id, p]));
  const give = proposal.give.map((id) => byId.get(id)!);
  const get = proposal.get.map((id) => byId.get(id)!);
  for (const p of give) p.teamId = proposal.partnerId;
  for (const p of get) p.teamId = ctx.userTeamId;
  ctx.league.pickOwners ??= {};
  for (const id of proposal.givePicks ?? []) ctx.league.pickOwners[id] = proposal.partnerId;
  for (const id of proposal.getPicks ?? []) ctx.league.pickOwners[id] = ctx.userTeamId;
  for (const teamId of [ctx.userTeamId, proposal.partnerId]) {
    fixRoster(ctx.players.filter((p) => p.teamId === teamId && !p.retired), teamId !== ctx.userTeamId);
  }
  const partner = ctx.teams.find((t) => t.id === proposal.partnerId)!;
  const names = (list: Player[], picks: string[] = []) =>
    [...list.map((p) => `${p.firstName} ${p.lastName}`), ...picks.map((id) => pickLabel(ctx.teams, parsePickId(id)).replace(/ · proj.*$/, '') + ' pick')].join(', ') || 'nothing';
  addNews(ctx.league, {
    kind: 'transaction',
    title: `Trade with ${partner.city}`,
    body: `Acquired ${names(get, proposal.getPicks)} for ${names(give, proposal.givePicks)}.`,
    teamId: partner.id,
    playerId: get.sort((a, b) => overall(b) - overall(a))[0]?.id,
    mine: true,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Trade finder

const tradeable = (ctx: TradeContext, teamId: number) =>
  ctx.players.filter((p) => p.teamId === teamId && !p.retired && !p.injury);

/**
 * Smallest package of the user's players the partner would accept for the
 * targets. Tries single players first (cheapest that works), then builds
 * up and trims. Returns null if nothing reasonable works.
 */
export function suggestPackage(ctx: TradeContext, partnerId: number, get: number[]): number[] | null {
  const mode = teamMode(ctx, partnerId);
  const contending = mode === 'contending';
  const mine = tradeable(ctx, ctx.userTeamId)
    .map((p) => ({ p, v: playerValue(p, contending) }))
    .sort((a, b) => a.v - b.v);
  const ok = (give: number[]) => evaluateTrade(ctx, { partnerId, give, get }).accepted;

  for (const { p } of mine) if (ok([p.id])) return [p.id];

  // Greedy: add the most valuable pieces until accepted, then trim extras.
  const give: number[] = [];
  for (const { p } of [...mine].reverse()) {
    give.push(p.id);
    if (ok(give)) {
      for (const id of [...give]) {
        const without = give.filter((x) => x !== id);
        if (without.length && ok(without)) give.splice(give.indexOf(id), 1);
      }
      return give;
    }
    if (give.length >= 4) break;
  }
  return null;
}

export interface ShopOffer {
  partnerId: number;
  get: number[];
}

/** What each team would give for one of the user's players: their best acceptable return. */
export function shopPlayer(ctx: TradeContext, playerId: number, limit = 5): ShopOffer[] {
  const offers: ShopOffer[] = [];
  for (const team of ctx.teams) {
    if (team.id === ctx.userTeamId) continue;
    const theirs = tradeable(ctx, team.id).sort((a, b) => overall(b) + overall(b, true) * 0.3 - (overall(a) + overall(a, true) * 0.3));
    const pick = theirs.find((p) => evaluateTrade(ctx, { partnerId: team.id, give: [playerId], get: [p.id] }).accepted);
    if (pick) offers.push({ partnerId: team.id, get: [pick.id] });
  }
  const byId = new Map(ctx.players.map((p) => [p.id, p]));
  return offers
    .sort((a, b) => overall(byId.get(b.get[0]!)!) - overall(byId.get(a.get[0]!)!))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// AI-initiated offers

const OFFER_DAYS = 7;

/**
 * Occasionally an AI team calls with an offer for one of the user's
 * players: contenders chase proven players, rebuilders chase youth.
 */
export function maybeMakeOffer(ctx: TradeContext, rng: { chance: (p: number) => boolean; pick: <T>(xs: readonly T[]) => T }): TradeOffer | null {
  const { league } = ctx;
  if (!tradeWindowOpen(league).open || league.phase !== 'regular') return null;
  league.offers = (league.offers ?? []).filter((o) => o.expires >= league.date);
  if (league.offers.length >= 2 || !rng.chance(0.08)) return null;

  const partner = rng.pick(ctx.teams.filter((t) => t.id !== ctx.userTeamId));
  const contending = teamMode(ctx, partner.id) === 'contending';
  const targets = tradeable(ctx, ctx.userTeamId)
    .filter((p) => (contending ? overall(p) >= 55 : p.age <= 25 && overall(p, true) >= 55))
    .sort((a, b) => playerValue(b, contending) - playerValue(a, contending));
  const target = targets.length ? rng.pick(targets.slice(0, 4)) : undefined;
  if (!target) return null;

  // Offer the best package from their side that they themselves would accept.
  const theirs = tradeable(ctx, partner.id).sort((a, b) => playerValue(b, !contending) - playerValue(a, !contending));
  for (const p of theirs) {
    if (evaluateTrade(ctx, { partnerId: partner.id, give: [target.id], get: [p.id] }).accepted) {
      const offer: TradeOffer = {
        id: league.nextOfferId ?? 1,
        partnerId: partner.id,
        give: [target.id],
        get: [p.id],
        expires: addDaysIso(league.date, OFFER_DAYS),
      };
      league.nextOfferId = offer.id + 1;
      league.offers.push(offer);
      addNews(league, {
        kind: 'transaction',
        title: `${partner.city} want ${target.firstName} ${target.lastName}`,
        body: `They offer ${p.firstName} ${p.lastName} (${p.position}, ${p.age}). Respond in Trades within a week.`,
        playerId: target.id,
        teamId: partner.id,
        mine: true,
      });
      return offer;
    }
  }
  return null;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function acceptOffer(ctx: TradeContext, offerId: number): TradeResult {
  const offer = ctx.league.offers?.find((o) => o.id === offerId);
  if (!offer) return { ok: false, reason: 'That offer is no longer on the table.' };
  ctx.league.offers = ctx.league.offers!.filter((o) => o.id !== offerId);
  return executeTrade(ctx, { partnerId: offer.partnerId, give: offer.give, get: offer.get });
}

export function declineOffer(league: League, offerId: number): void {
  league.offers = (league.offers ?? []).filter((o) => o.id !== offerId);
}
