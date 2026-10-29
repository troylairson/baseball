import { generatePlayer } from '../generate/players';
import { isPitcher } from '../model/ratings';
import type { Player, Position, Team } from '../model/types';
import { Rng } from '../rng';
import { simGame, type TeamGameInput } from '../sim/game';
import { autoPlan } from '../sim/lineup';
import { computeNorms, type RatingNorms } from '../sim/norms';
import { appendLines, type BatLog, type PitLog } from './gamelog';
import type { SeasonState } from './season';

/**
 * The user's Triple-A club plays a real game each day the big club does,
 * against another organization's Triple-A roster, with the same game
 * engine. Only the lines are kept (no injuries or fatigue), and it runs on
 * its own random stream, so big league results are unaffected.
 */
export interface FarmLog {
  season: number;
  wins: number;
  losses: number;
  /** Games played (also numbers them: farm games use negative ids). */
  games: number;
  bat: Record<number, BatLog[]>;
  pit: Record<number, PitLog[]>;
}

export function farmLog(state: SeasonState): FarmLog {
  const { league } = state;
  if (!league.farm || league.farm.season !== league.season) {
    league.farm = { season: league.season, wins: 0, losses: 0, games: 0, bat: {}, pit: {} };
  }
  return league.farm;
}

/** Filler players have ids at or below this; their lines aren't kept. */
const FILLER_ID = -1_000_000;

/** What a Triple-A club needs to take the field: nine hitters (one a catcher), two starters, four relievers. */
const NEED: { position: Position | 'hitter'; count: (r: Player[]) => number; min: number }[] = [
  { position: 'C', count: (r) => r.filter((p) => p.position === 'C').length, min: 1 },
  { position: 'hitter', count: (r) => r.filter((p) => !isPitcher(p)).length, min: 9 },
  { position: 'SP', count: (r) => r.filter((p) => p.position === 'SP').length, min: 2 },
  { position: 'RP', count: (r) => r.filter((p) => p.position === 'RP').length, min: 4 },
];
const FILL_HITTERS: Position[] = ['SS', '2B', 'CF', '3B', 'LF', 'RF', '1B'];

/**
 * A club's healthy Triple-A players, topped up with organizational filler
 * (the same stand-ins every day, never recorded) when call-ups and injuries
 * leave it short.
 */
function farmRoster(state: SeasonState, teamId: number): Player[] {
  const roster = state.players.filter((p) => p.teamId === teamId && p.level === 'AAA' && !p.retired && !p.injury && !p.draftProspect);
  let k = 0;
  for (const need of NEED) {
    while (need.count(roster) < need.min) {
      const position = need.position === 'hitter' ? FILL_HITTERS[k % FILL_HITTERS.length]! : need.position;
      const rng = new Rng(`${state.seed}-filler-${teamId}-${k}`);
      roster.push(generatePlayer({ id: FILLER_ID - teamId * 100 - k, position, talent: 40, age: 28, teamId, level: 'AAA' }, rng));
      k++;
    }
  }
  return roster;
}

function farmInput(team: Team, roster: Player[], gameNumber: number): TeamGameInput {
  const plan = autoPlan(roster, false);
  // A rotation through the Triple-A starters.
  const starterId = plan.rotation[gameNumber % Math.max(1, plan.rotation.length)] ?? roster.find((p) => isPitcher(p))!.id;
  return { team, roster, plan, starterId };
}

/** Triple-A is its own league: its average player is the baseline, so its stat lines read like a normal league's. */
function farmNorms(state: SeasonState): RatingNorms {
  return computeNorms(state.players.filter((p) => p.level === 'AAA' && p.teamId !== null && !p.retired).map((p) => ({ ...p, level: 'MLB' as const })));
}

/** Play today's Triple-A game for the user's organization. */
export function playFarmGame(state: SeasonState): void {
  const { league } = state;
  const user = state.teams.find((t) => t.id === state.userTeamId);
  if (!user) return;
  const log = farmLog(state);
  const rng = new Rng(`${state.seed}-farm-${league.date}`);
  // A different organization's affiliate each day.
  const others = state.teams.filter((t) => t.id !== user.id);
  const opp = others[log.games % others.length];
  if (!opp) return;
  const home = rng.chance(0.5);
  const me = farmInput(user, farmRoster(state, user.id), log.games);
  const them = farmInput(opp, farmRoster(state, opp.id), log.games + 2);
  const result = simGame(home ? them : me, home ? me : them, false, rng, false, farmNorms(state));
  log.games++;
  const ours = home ? result.home : result.away;
  const other = home ? result.away : result.home;
  if (ours.runs > other.runs) log.wins++;
  else log.losses++;
  const real = (id: number) => id > FILLER_ID / 2;
  appendLines(log, { id: -log.games, date: league.date }, opp.id, {
    ...ours, batters: ours.batters.filter((b) => real(b.playerId)), pitchers: ours.pitchers.filter((p) => real(p.playerId)),
  });
}

/** Season totals from a player's Triple-A game log. */
export function farmTotals(log: FarmLog | undefined | null, playerId: number) {
  const bat = log?.bat[playerId] ?? [];
  const pit = log?.pit[playerId] ?? [];
  const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
  return {
    games: Math.max(bat.length, pit.length),
    bat: {
      pa: sum(bat, (x) => x.pa), ab: sum(bat, (x) => x.ab), h: sum(bat, (x) => x.h), hr: sum(bat, (x) => x.hr),
      xbh: sum(bat, (x) => x.xbh), bb: sum(bat, (x) => x.bb), so: sum(bat, (x) => x.so), rbi: sum(bat, (x) => x.rbi),
    },
    pit: {
      g: pit.length, gs: sum(pit, (x) => x.gs), outs: sum(pit, (x) => x.outs), h: sum(pit, (x) => x.h), er: sum(pit, (x) => x.er),
      bb: sum(pit, (x) => x.bb), so: sum(pit, (x) => x.so), hr: sum(pit, (x) => x.hr), sv: sum(pit, (x) => x.sv),
    },
  };
}
