import { overall } from '../model/ratings';
import type { Player, Team } from '../model/types';
import type { SeasonState } from './season';

/** Ticket price levels and how they trade revenue per fan against attendance. */
export const TICKET_LEVELS = [
  { label: 'Bargain', price: 0.6, demand: 1.2 },
  { label: 'Low', price: 0.8, demand: 1.1 },
  { label: 'Standard', price: 1, demand: 1 },
  { label: 'High', price: 1.25, demand: 0.85 },
  { label: 'Premium', price: 1.5, demand: 0.7 },
] as const;

export const STADIUM_CAPACITY = 40000;
const DAYS_BETWEEN_UPDATES = 7;

export interface SeasonFinances {
  season: number;
  homeGames: number;
  attendance: number;
  /** All revenue in $K. */
  tickets: number;
  playoffs: number;
  media: number;
  merch: number;
}

export function emptyFinances(season: number): SeasonFinances {
  return { season, homeGames: 0, attendance: 0, tickets: 0, playoffs: 0, media: 0, merch: 0 };
}

export const totalRevenue = (f: SeasonFinances) => f.tickets + f.playoffs + f.media + f.merch;

/** Average ticket price in dollars, by market size. */
const basePrice = (team: Team) => 32 + team.market * 4;

/** Fill rate of the ballpark for a game. */
export function expectedFill(team: Team): number {
  const level = TICKET_LEVELS[team.ticketPrice ?? 2]!;
  const interest = team.fanInterest ?? 50;
  return Math.max(0.15, Math.min(1, (0.3 + interest * 0.0065) * level.demand));
}

export function projectedAttendance(team: Team): number {
  return Math.round(STADIUM_CAPACITY * expectedFill(team));
}

/** Gate for one home game; returns attendance. */
export function recordHomeGate(team: Team, season: number, playoff: boolean): number {
  const f = (team.finances && team.finances.season === season) ? team.finances : (team.finances = emptyFinances(season));
  const level = TICKET_LEVELS[team.ticketPrice ?? 2]!;
  const fill = playoff ? 1 : expectedFill(team);
  const attendance = Math.round(STADIUM_CAPACITY * fill);
  const gate = (attendance * basePrice(team) * level.price * (playoff ? 1.6 : 1)) / 1000;
  if (playoff) f.playoffs += Math.round(gate);
  else {
    f.homeGames++;
    f.attendance += attendance;
    f.tickets += Math.round(gate);
  }
  return attendance;
}

/** Where interest is heading: market, winning, stars and pricing. */
export function fanInterestTarget(team: Team, players: Player[]): number {
  const games = team.wins + team.losses;
  const winning = games >= 10 ? (team.wins / games - 0.5) * 90 : 0;
  const stars = players
    .filter((p) => p.teamId === team.id && p.level === 'MLB' && !p.retired)
    .map((p) => overall(p))
    .sort((a, b) => b - a)
    .slice(0, 3);
  const starPower = stars.length ? (stars.reduce((s, x) => s + x, 0) / stars.length - 58) * 0.8 : 0;
  const pricing = [3, 1, 0, -2, -5][team.ticketPrice ?? 2]!;
  return Math.max(5, Math.min(100, 38 + team.market * 4 + winning + starPower + pricing));
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/** Weekly drift of fan interest toward its target. */
export function updateFans(state: SeasonState, force = false): void {
  const { league } = state;
  if (!force && league.fansDate && daysBetween(league.fansDate, league.date) < DAYS_BETWEEN_UPDATES) return;
  league.fansDate = league.date;
  for (const t of state.teams) {
    const target = fanInterestTarget(t, state.players);
    const cur = t.fanInterest ?? target;
    t.fanInterest = Math.round(cur + (target - cur) * 0.12);
  }
}

/** Fill in fan interest and pricing for teams that don't have them yet. */
export function ensureFinances(state: SeasonState): void {
  for (const t of state.teams) {
    t.ticketPrice ??= 2;
    t.fanInterest ??= Math.round(fanInterestTarget(t, state.players));
    if (!t.finances || t.finances.season !== state.league.season) t.finances = emptyFinances(state.league.season);
  }
}

/** Book media and merchandise money at season's end; playoff success lifts interest. */
export function closeSeasonBooks(state: SeasonState): void {
  const champ = state.league.playoffs?.championId;
  const inPlayoffs = new Set(state.league.playoffs?.series.flatMap((s) => [s.highId, s.lowId]) ?? []);
  for (const t of state.teams) {
    const f = (t.finances && t.finances.season === state.league.season) ? t.finances : (t.finances = emptyFinances(state.league.season));
    f.media = 30000 + t.market * 12000;
    f.merch = Math.round((t.fanInterest ?? 50) * 250);
    if (inPlayoffs.has(t.id)) t.fanInterest = Math.min(100, (t.fanInterest ?? 50) + 5);
    if (champ === t.id) t.fanInterest = Math.min(100, (t.fanInterest ?? 50) + 8);
    t.lastFinances = { ...f };
  }
}

/**
 * Next season's owner budget: half last year's budget, half what the club
 * earned (owners keep ~15% as profit). Successful, popular teams grow.
 */
export function nextBudget(team: Team): number {
  const current = team.budget ?? 110000;
  const revenue = team.lastFinances ? totalRevenue(team.lastFinances) : current / 0.85;
  return Math.round((current * 0.5 + revenue * 0.85 * 0.5) / 1000) * 1000;
}
