import { isPitcher, overall } from '../model/ratings';
import type { Player, Team } from '../model/types';
import { Rng, hashString } from '../rng';
import { contractDemand, DOLLARS_PER_WAR, expectedWar, marketSalary, MIN_SALARY, roleOf } from './contracts';
import { nextBudget } from './finance';
import { addNews } from './news';
import { fixRoster } from './roster';
import type { SeasonState } from './season';
import { staffCost } from './staff';

/**
 * The offseason free agent market. Free agency runs in rounds: you (and AI
 * clubs) make offers; at the end of each round every free agent weighs the
 * offers on the table and signs with the best one if it meets his price. A
 * player's price drops the longer he goes unsigned.
 */

export const MARKET_ROUNDS = 4;

export interface MarketOffer {
  playerId: number;
  teamId: number;
  salary: number;
  years: number;
}

export interface MarketState {
  round: number;
  /** The user's standing offers (AI offers are made fresh each round). */
  offers: MarketOffer[];
  /** AI clubs that bid on each player last round. */
  interest: Record<number, number>;
  /** Best AI offer last round, by player, as the player scores it. */
  bestScore: Record<number, number>;
}

export type MarketResult = { ok: true } | { ok: false; reason: string };

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;
const freeAgents = (players: Player[]) => players.filter((p) => p.teamId === null && !p.retired && !p.draftProspect);

/** How much of his ask a player will take, by round (he gets more realistic over time). */
export function patience(round: number): number {
  return [1, 0.93, 0.86, 0.78, 0.7][Math.min(4, Math.max(0, round - 1))]!;
}

export function openMarket(state: SeasonState): void {
  state.league.market = { round: 1, offers: [], interest: {}, bestScore: {} };
}

/** Last season's winning percentage, or roster strength before games are played. */
function winPct(team: Team): number {
  const g = team.wins + team.losses;
  return g ? team.wins / g : 0.5;
}

/**
 * How attractive an offer is to a player, in "dollars he'd feel".
 * Money first, then years relative to what he wants, then winning, market
 * size and loyalty to his old club, plus a personal quirk per team.
 */
export function offerScore(p: Player, offer: { teamId: number; salary: number; years: number }, team: Team): number {
  const want = (p.demand ?? contractDemand(p)).years;
  const yearsFactor = Math.max(0.7, Math.min(1.12, 1 + 0.06 * (offer.years - want)));
  const winning = (winPct(team) - 0.5) * 0.2;
  const market = (team.market - 3) * 0.015;
  const loyal = p.formerTeamId === team.id ? (p.personality.loyalty - 50) / 300 + ((p.morale ?? 50) - 50) / 400 : 0;
  // Greedy players care about the money; others weigh fit more.
  const fit = (winning + market + loyal) * (1.3 - p.personality.greed / 100);
  const quirk = ((hashString(`${p.id}-${team.id}`) % 1000) / 1000 - 0.5) * 0.06;
  return offer.salary * yearsFactor * (1 + fit + quirk);
}

/** What the player will accept this round, in offer-score terms. */
export function reservation(p: Player, round: number): number {
  return (p.demand ?? contractDemand(p)).salary * patience(round);
}

export type Interest = 'likely' | 'competitive' | 'unlikely';

/** How a user offer stacks up right now. */
export function offerOutlook(state: SeasonState, offer: MarketOffer): Interest {
  const p = state.players.find((x) => x.id === offer.playerId)!;
  const team = state.teams.find((t) => t.id === offer.teamId)!;
  const market = state.league.market;
  const score = offerScore(p, offer, team);
  const rival = market?.bestScore[p.id] ?? 0;
  const res = reservation(p, market?.round ?? 1);
  if (score < res * 0.95) return 'unlikely';
  if (score >= rival * 1.05 && score >= res) return 'likely';
  return 'competitive';
}

export function makeOffer(state: SeasonState, offer: MarketOffer): MarketResult {
  const market = state.league.market;
  if (!market) return { ok: false, reason: 'Free agency is not open.' };
  const p = state.players.find((x) => x.id === offer.playerId);
  if (!p || p.teamId !== null || p.retired) return { ok: false, reason: 'He has already signed.' };
  if (offer.salary < MIN_SALARY) return { ok: false, reason: `The minimum salary is $${(MIN_SALARY / 1000).toFixed(2)}M.` };
  if (offer.years < 1 || offer.years > 10) return { ok: false, reason: 'Offers run 1 to 10 years.' };
  market.offers = market.offers.filter((o) => o.playerId !== offer.playerId).concat({ ...offer, salary: Math.round(offer.salary / 10) * 10 });
  return { ok: true };
}

export function withdrawOffer(state: SeasonState, playerId: number): void {
  const market = state.league.market;
  if (market) market.offers = market.offers.filter((o) => o.playerId !== playerId);
}

// ---------------------------------------------------------------------------
// AI clubs

/** Payroll already committed for next season and the one after. */
function commitments(state: SeasonState, teamId: number): [number, number] {
  let next = 0;
  let after = 0;
  for (const p of state.players) {
    if (p.teamId !== teamId || p.retired || !p.contract) continue;
    if (p.contract.years >= 1) next += p.contract.salary;
    if (p.contract.years >= 2) after += p.contract.salary;
  }
  return [next, after];
}

/** WAR of the player a signing would push out of the lineup/rotation/bullpen. */
function replacedWar(state: SeasonState, teamId: number, fa: Player): number {
  const org = state.players.filter((p) => p.teamId === teamId && !p.retired && !p.injury);
  const role = roleOf(fa);
  const war = (p: Player) => expectedWar(p);
  if (role === 'SP') {
    const sps = org.filter((p) => p.position === 'SP').map(war).sort((a, b) => b - a);
    return sps[4] ?? -0.5;
  }
  if (role === 'RP') {
    const rps = org.filter((p) => p.position === 'RP').map(war).sort((a, b) => b - a);
    return rps[6] ?? -0.3;
  }
  // Hitters: the best player at his position (or who can play it), else the 9th-best bat.
  const atPos = org.filter((p) => !isPitcher(p) && (p.position === fa.position || p.positionRatings[fa.position as keyof Player['positionRatings']] !== undefined));
  const best = atPos.map(war).sort((a, b) => b - a)[0];
  const ninth = org.filter((p) => !isPitcher(p)).map(war).sort((a, b) => b - a)[8] ?? -0.5;
  return best === undefined ? ninth : Math.max(Math.min(best, ninth + 1.5), ninth);
}

interface Bid extends MarketOffer {
  score: number;
}

function contending(state: SeasonState, team: Team): boolean {
  const ranked = [...state.teams].sort((a, b) => winPct(b) - winPct(a) || b.runsScored - b.runsAllowed - (a.runsScored - a.runsAllowed));
  return ranked.indexOf(team) < state.teams.length / 2;
}

/** Each AI club's offers for this round. */
function aiBids(state: SeasonState, rng: Rng): Bid[] {
  const pool = freeAgents(state.players).sort((a, b) => expectedWar(b) - expectedWar(a));
  const bids: Bid[] = [];
  // Clubs stay under a luxury-tax line well above the league's average payroll.
  const payrolls = state.teams.map((t) => commitments(state, t.id)[0]);
  const taxLine = (payrolls.reduce((a, b) => a + b, 0) / payrolls.length) * 1.3;
  for (const team of rng.shuffle(state.teams.filter((t) => t.id !== state.userTeamId))) {
    const budget = Math.min(nextBudget(team) * 0.97 - staffCost(state.league, team), taxLine);
    let [next, after] = commitments(state, team.id);
    const win = contending(state, team);
    // Clubs far under budget have to spend: they bid harder and on more players.
    const thrifty = next < budget * 0.6;
    let made = 0;
    // Targets: biggest upgrade for the money, with front offices disagreeing a little.
    const targets = pool
      .map((fa) => {
        const ask = fa.demand ?? contractDemand(fa);
        const upgrade = expectedWar(fa) - replacedWar(state, team.id, fa);
        return { fa, value: (upgrade * DOLLARS_PER_WAR - ask.salary * patience(state.league.market!.round)) / 1000 + upgrade * 2 + rng.normal(0, 3) };
      })
      .sort((a, b) => b.value - a.value)
      .map((t) => t.fa);
    for (const fa of targets) {
      if (made >= 3) break;
      const ask = fa.demand ?? contractDemand(fa);
      // Rebuilding clubs sign veterans only on short deals (often to flip them at the deadline).
      if (!win && !thrifty && fa.age > 32) continue;
      const upgrade = expectedWar(fa) - replacedWar(state, team.id, fa);
      if (upgrade < (thrifty ? 0.3 : 0.6)) continue;
      // What the club thinks he's worth to them, with some disagreement between front offices.
      const worth = marketSalary(expectedWar(fa), roleOf(fa)) * (win ? 1.08 : thrifty ? 1.12 : 0.9) * (0.85 + rng.next() * 0.3);
      const salary = Math.round(Math.min(worth, ask.salary * 1.15) / 10) * 10;
      if (salary < ask.salary * patience(state.league.market!.round) * 0.9) continue;
      const years = win || fa.age <= 27 ? ask.years : Math.min(ask.years, 2);
      if (next + salary > budget || (years > 1 && after + salary > budget * 1.02)) continue;
      next += salary;
      if (years > 1) after += salary;
      bids.push({ playerId: fa.id, teamId: team.id, salary, years, score: offerScore(fa, { teamId: team.id, salary, years }, team) });
      made++;
    }
  }
  return bids;
}

// ---------------------------------------------------------------------------
// Rounds

function sign(state: SeasonState, p: Player, offer: MarketOffer): void {
  const team = state.teams.find((t) => t.id === offer.teamId)!;
  p.teamId = team.id;
  p.contract = { salary: offer.salary, years: offer.years };
  p.demand = null;
  p.level = 'MLB';
  fixRoster(state.players.filter((x) => x.teamId === team.id && !x.retired), team.id !== state.userTeamId);
  const mine = team.id === state.userTeamId;
  if (mine || overall(p) >= 55) {
    addNews(state.league, {
      kind: 'transaction',
      title: `${team.city} sign ${fullName(p)}`,
      body: `${offer.years} year${offer.years > 1 ? 's' : ''}, $${(offer.salary / 1000).toFixed(1)}M per season.`,
      playerId: p.id,
      teamId: team.id,
      mine,
    });
  }
}

export interface RoundSummary {
  /** Players the user signed this round. */
  signed: number[];
  /** Players the user bid on who went elsewhere. */
  lost: { playerId: number; teamId: number }[];
}

/** Close a round: AI clubs bid, every free agent with offers decides. */
export function resolveRound(state: SeasonState, final = false): RoundSummary {
  const market = state.league.market;
  const summary: RoundSummary = { signed: [], lost: [] };
  if (!market) return summary;
  const rng = new Rng(`${state.seed}-market-${state.league.season}-${market.round}`);
  const bids = aiBids(state, rng);
  const userTeam = state.teams.find((t) => t.id === state.userTeamId)!;
  for (const o of market.offers) {
    const p = state.players.find((x) => x.id === o.playerId);
    if (p && p.teamId === null) bids.push({ ...o, score: offerScore(p, o, userTeam) });
  }
  const byPlayer = new Map<number, Bid[]>();
  for (const b of bids) byPlayer.set(b.playerId, [...(byPlayer.get(b.playerId) ?? []), b]);

  market.interest = {};
  market.bestScore = {};
  for (const [playerId, list] of byPlayer) {
    const p = state.players.find((x) => x.id === playerId)!;
    if (p.teamId !== null) continue;
    const best = list.sort((a, b) => b.score - a.score)[0]!;
    const ai = list.filter((b) => b.teamId !== state.userTeamId);
    market.interest[playerId] = ai.length;
    market.bestScore[playerId] = ai[0]?.score ?? 0;
    // In the last round, anyone with an offer takes the best one that's at all reasonable.
    const floor = final ? (p.demand ?? contractDemand(p)).salary * 0.6 : reservation(p, market.round);
    if (best.score >= floor) {
      sign(state, p, best);
      if (best.teamId === state.userTeamId) summary.signed.push(p.id);
      else if (list.some((b) => b.teamId === state.userTeamId)) summary.lost.push({ playerId: p.id, teamId: best.teamId });
    }
  }
  // Offers to players who signed are gone.
  market.offers = market.offers.filter((o) => state.players.find((x) => x.id === o.playerId)?.teamId === null);
  market.round++;
  return summary;
}

/** Finish free agency: play out the remaining rounds. */
export function closeMarket(state: SeasonState): void {
  const market = state.league.market;
  if (!market) return;
  while (market.round <= MARKET_ROUNDS) resolveRound(state, market.round === MARKET_ROUNDS);
  state.league.market = null;
}
