import { isPitcher, overall } from '../model/ratings';
import type { League, Player, Team } from '../model/types';
import { playerValue } from './contracts';
import { addNews } from './news';
import { payroll, payrollBudget, teamStrength } from './offseason';
import { fixRoster } from './roster';

export interface TradeProposal {
  partnerId: number;
  /** Players the user sends away. */
  give: number[];
  /** Players the user receives. */
  get: number[];
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

  const window = tradeWindowOpen(ctx.league);
  if (!window.open) return no(window.reason!);
  if (give.length === 0 && get.length === 0) return no('Add players to build a deal.');
  if (give.some((p) => p.teamId !== ctx.userTeamId) || get.some((p) => p.teamId !== proposal.partnerId)) {
    return no('Those players are no longer available.');
  }
  if (get.length === 0) return no('Pick at least one of their players.');

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

  const valueIn = sumValue(give, contending);
  const valueOut = sumValue(get, contending);
  // AI teams want to win the trade, and value quality over quantity.
  const depthDiscount = give.length > get.length ? 0.85 ** (give.length - get.length) : 1;
  const needed = valueOut * 1.12 + 3;
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
  for (const teamId of [ctx.userTeamId, proposal.partnerId]) {
    fixRoster(ctx.players.filter((p) => p.teamId === teamId && !p.retired), teamId !== ctx.userTeamId);
  }
  const partner = ctx.teams.find((t) => t.id === proposal.partnerId)!;
  const names = (list: Player[]) => list.map((p) => `${p.firstName} ${p.lastName}`).join(', ') || 'nothing';
  addNews(ctx.league, {
    kind: 'transaction',
    title: `Trade with ${partner.city}`,
    body: `Acquired ${names(get)} for ${names(give)}.`,
    teamId: partner.id,
    playerId: get.sort((a, b) => overall(b) - overall(a))[0]?.id,
    mine: true,
  });
  return { ok: true };
}
