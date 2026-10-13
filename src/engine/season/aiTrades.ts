import type { Player, Team } from '../model/types';
import type { Rng } from '../rng';
import { expectedWar, roleOf } from './contracts';
import { addNews } from './news';
import { fixRoster } from './roster';
import type { SeasonState } from './season';
import { evaluateTrade, needMultiplier, teamMode, tradeDeadline, tradeWindowOpen } from './trades';
import { controlYears, playerValue, teamView } from './value';

/**
 * Trades between AI clubs. A contender looks for its biggest upgrade on a
 * rebuilding club and builds a package from its prospects and spare parts;
 * the deal happens only if both front offices think they come out ahead.
 */

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;

/** Chance per day that some AI clubs try to make a deal. */
function dailyChance(state: SeasonState): number {
  const { league } = state;
  if (league.phase === 'offseason') return 0;
  const deadline = tradeDeadline(league.season);
  const daysLeft = (Date.parse(`${deadline}T12:00:00Z`) - Date.parse(`${league.date}T12:00:00Z`)) / 86400000;
  if (daysLeft < 0) return 0;
  // Deadline season is busy; the rest of the year, an occasional deal.
  return daysLeft <= 24 ? 0.5 : 0.08;
}

export function maybeAiTrade(state: SeasonState, rng: Rng): boolean {
  if (!rng.chance(dailyChance(state))) return false;
  return attemptAiTrade(state, rng);
}

/** Try once to find a deal between a contender and a rebuilder. */
export function attemptAiTrade(state: SeasonState, rng: Rng): boolean {
  if (!tradeWindowOpen(state.league).open) return false;
  const ai = state.teams.filter((t) => t.id !== state.userTeamId);
  const buyers = ai.filter((t) => teamMode(state, t.id) === 'contending');
  const sellers = ai.filter((t) => teamMode(state, t.id) === 'rebuilding');
  if (!buyers.length || !sellers.length) return false;
  const buyer = rng.pick(buyers);
  const roster = (teamId: number) => state.players.filter((p) => p.teamId === teamId && !p.retired);
  const buyerOrg = roster(buyer.id);
  const buyerView = (p: Player) => teamView(state.league, buyer, p);

  // Targets: established players on rebuilding clubs who'd start for the buyer.
  const targets = sellers
    // Rebuilders sell veterans on short deals, not the young core they're building around.
    .flatMap((s) => roster(s.id).filter((p) => p.level === 'MLB' && !p.injury && expectedWar(p) >= 1.5 && (controlYears(p) <= 2 || p.age >= 30)))
    .map((p) => ({ p, need: needMultiplier([...buyerOrg, p], p, buyerView) }))
    .filter((t) => t.need >= 1.03)
    .sort((a, b) => expectedWar(b.p) * b.need - expectedWar(a.p) * a.need)
    .slice(0, 4);

  for (const { p: target } of targets) {
    const seller = state.teams.find((t) => t.id === target.teamId)!;
    const package_ = findPackage(state, buyer, seller, target, buyerOrg, buyerView);
    if (package_) {
      execute(state, buyer, seller, package_, target);
      return true;
    }
  }
  return false;
}

function findPackage(state: SeasonState, buyer: Team, seller: Team, target: Player, buyerOrg: Player[], buyerView: (p: Player) => ReturnType<typeof teamView>): number[] | null {
  // What the buyer can spare: prospects, depth and bench players, not its core.
  const starters = buyerOrg.filter((x) => x.position === 'SP').length;
  const sellerValue = new Map<number, number>();
  const spare = buyerOrg
    .filter((p) => !p.injury && p.id !== target.id && (p.level === 'AAA' || needMultiplier(buyerOrg, p, buyerView) < 1.03))
    .filter((p) => !(p.position === 'SP' && starters <= 7))
    .map((p) => {
      sellerValue.set(p.id, playerValue(p, false, teamView(state.league, seller, p)));
      return p;
    })
    .filter((p) => sellerValue.get(p.id)! > 0)
    // Lead with what the seller likes most.
    .sort((a, b) => sellerValue.get(b.id)! - sellerValue.get(a.id)!)
    .slice(0, 8);
  const sellerSays = (give: number[]) => evaluateTrade({ ...state, userTeamId: buyer.id }, { partnerId: seller.id, give, get: [target.id] }, { fair: true }).accepted;
  const buyerSays = (give: number[]) => evaluateTrade({ ...state, userTeamId: seller.id }, { partnerId: buyer.id, give: [target.id], get: give }, { fair: true }).accepted;

  // Build up from the seller's favorites until they say yes; then check the
  // buyer, swapping the last piece for cheaper ones if the buyer balks.
  for (let lead = 0; lead < Math.min(4, spare.length); lead++) {
    const give = [spare[lead]!.id];
    for (let i = 0; i < spare.length && give.length <= 3; i++) {
      if (sellerSays(give)) {
        if (buyerSays(give)) return give;
        break;
      }
      const next = spare[i]!;
      if (!give.includes(next.id)) give.push(next.id);
    }
    if (give.length <= 3 && sellerSays(give) && buyerSays(give)) return give;
  }
  return null;
}

function execute(state: SeasonState, buyer: Team, seller: Team, give: number[], target: Player): void {
  const byId = new Map(state.players.map((p) => [p.id, p]));
  for (const id of give) {
    const p = byId.get(id)!;
    p.teamId = seller.id;
    p.tradeRequested = false;
  }
  target.teamId = buyer.id;
  target.tradeRequested = false;
  for (const team of [buyer, seller]) fixRoster(state.players.filter((p) => p.teamId === team.id && !p.retired), true);
  const sent = give.map((id) => byId.get(id)!);
  addNews(state.league, {
    kind: 'transaction',
    title: `${buyer.city} acquire ${fullName(target)}`,
    body: `${seller.city} get ${sent.map((p) => `${fullName(p)} (${p.position}, ${p.age})`).join(' and ')}. ${roleOf(target) === 'H' ? 'A bat' : roleOf(target) === 'SP' ? 'A starter' : 'Bullpen help'} for a contender.`,
    playerId: target.id,
    teamId: buyer.id,
  });
}
