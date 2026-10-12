import { addLine, emptyBatting, emptyPitching, type PlayerSeasonStats } from '../model/stats';
import type { League, Player, ScheduledGame, Team } from '../model/types';
import { Rng } from '../rng';
import { simGame, type GameResult, type TeamGameInput } from '../sim/game';
import { resolvePlan, type GamePlan } from '../sim/lineup';
import { computeNorms, type RatingNorms } from '../sim/norms';
import { rollInjuries } from '../sim/injuries';
import { addNews } from './news';
import { fixRoster, rosterIssues } from './roster';
import { staffRating } from './staff';
import {
  activeSeries, advanceBracket, createPlayoffs, nextSeriesGame, recordSeriesGame, roundName,
} from './playoffs';
import { addDays } from './schedule';

export interface SeasonState {
  league: League;
  teams: Team[];
  players: Player[];
  schedule: ScheduledGame[];
  stats: Map<number, PlayerSeasonStats>;
  userTeamId: number;
  seed: number;
  /** League rating averages for this season; computed lazily. */
  norms?: RatingNorms;
}

export interface PlayedGame {
  game: ScheduledGame;
  result: GameResult;
}

/** Pitchers fit to start must be at or below this workload. */
export const STARTER_READY = 25;
const RECOVERY = { SP: 20, RP: 12 };

const isRegular = (g: ScheduledGame) => g.seriesId === undefined;

/** True once every regular-season game has been played. */
export function seasonOver(state: Pick<SeasonState, 'schedule'>): boolean {
  return state.schedule.every((g) => !isRegular(g) || g.played);
}

export function playoffsOver(state: Pick<SeasonState, 'league'>): boolean {
  return !!state.league.playoffs && state.league.playoffs.championId !== null;
}

export function nextGameFor(state: SeasonState, teamId: number): ScheduledGame | undefined {
  return state.schedule.find((g) => !g.played && (g.homeId === teamId || g.awayId === teamId));
}

/** Healthy major leaguers available to play today. */
export function activeRoster(players: Player[], teamId: number): Player[] {
  return players.filter((p) => p.teamId === teamId && p.level === 'MLB' && !p.retired && !p.injury);
}

/** Head trainer quality (20–80) for a team; shortens injuries. */
export function trainerRating(state: SeasonState, teamId: number): number {
  return staffRating(state.league, teamId, 'trainer');
}

/** Fix any team whose active roster is illegal (e.g. after injuries); tell the user. */
export function maintainRosters(state: SeasonState): void {
  for (const team of state.teams) {
    const org = state.players.filter((p) => p.teamId === team.id && !p.retired);
    if (rosterIssues(org.filter((p) => p.level === 'MLB')).length === 0) continue;
    const moves = fixRoster(org, team.id !== state.userTeamId);
    if (team.id === state.userTeamId && moves.length) {
      const byId = new Map(org.map((p) => [p.id, p]));
      const describe = (to: 'MLB' | 'AAA') =>
        moves.filter((m) => m.to === to).map((m) => { const p = byId.get(m.playerId)!; return `${p.firstName} ${p.lastName}`; }).join(', ');
      const up = describe('MLB');
      const down = describe('AAA');
      addNews(state.league, {
        kind: 'team',
        title: 'Roster moves',
        body: [up && `Called up ${up}.`, down && `Optioned ${down}.`].filter(Boolean).join(' '),
        mine: true,
      });
    }
  }
}

function applyInjuries(state: SeasonState, game: ScheduledGame, result: GameResult, players: Map<number, Player>): void {
  const rng = new Rng(`${state.seed}-${state.league.season}-inj-${game.id}`);
  for (const { playerId, injury } of rollInjuries(result, players, rng, (teamId) => trainerRating(state, teamId))) {
    const p = players.get(playerId)!;
    p.injury = injury;
    if (p.teamId === state.userTeamId) {
      addNews(state.league, {
        kind: 'team',
        title: `${p.firstName} ${p.lastName} to the injured list`,
        body: `${injury.description[0]!.toUpperCase()}${injury.description.slice(1)} — expected out about ${injury.days} days.`,
        playerId,
        mine: true,
      });
    }
  }
}

export function planFor(state: SeasonState, teamId: number): GamePlan {
  const team = state.teams.find((t) => t.id === teamId);
  return resolvePlan(activeRoster(state.players, teamId), team?.plan, state.league.settings.designatedHitter);
}

/** Next rested starter in the rotation; advances the team's rotation pointer. */
export function pickStarter(team: Team, plan: GamePlan, roster: Map<number, Player>, commit = true): number {
  const rot = plan.rotation;
  for (let k = 0; k < rot.length; k++) {
    const idx = (team.rotationSlot + k) % rot.length;
    const p = roster.get(rot[idx]!);
    if (p && p.fatigue < STARTER_READY) {
      if (commit) team.rotationSlot = (idx + 1) % rot.length;
      return p.id;
    }
  }
  // Everyone is tired: start the most rested pitcher available.
  const fallback = [...roster.values()].filter((p) => p.pitching).sort((a, b) => a.fatigue - b.fatigue)[0];
  return fallback!.id;
}

function statsFor(state: SeasonState, player: Player): PlayerSeasonStats {
  let s = state.stats.get(player.id);
  if (!s) {
    s = { playerId: player.id, season: state.league.season, teamId: player.teamId ?? -1, bat: emptyBatting(), pit: emptyPitching() };
    state.stats.set(player.id, s);
  }
  return s;
}

function teamInput(state: SeasonState, team: Team): TeamGameInput {
  const roster = activeRoster(state.players, team.id);
  const plan = resolvePlan(roster, team.plan, state.league.settings.designatedHitter);
  const starterId = pickStarter(team, plan, new Map(roster.map((p) => [p.id, p])));
  return { team, roster, plan, starterId };
}

/** Move from preseason to opening day. */
export function startSeason(state: SeasonState): void {
  if (state.league.phase !== 'preseason') return;
  state.league.phase = 'regular';
  const first = state.schedule.find((g) => !g.played);
  if (first) state.league.date = first.date;
}

/** Set up the bracket once the regular season is complete. */
export function startPlayoffs(state: SeasonState): void {
  const { league } = state;
  if (league.phase !== 'regular' || !seasonOver(state)) return;
  league.phase = 'playoffs';
  league.playoffs = createPlayoffs(league, state.teams);
  const lastRegular = state.schedule.filter(isRegular).at(-1)?.date ?? league.date;
  league.date = addDays(lastRegular, 2);
  const inField = new Set(league.playoffs.series.flatMap((s) => [s.highId, s.lowId]));
  const user = state.teams.find((t) => t.id === state.userTeamId)!;
  addNews(league, {
    kind: 'league',
    title: `${league.season} playoffs begin`,
    body: inField.has(user.id)
      ? `The ${user.name} are in the field of ${inField.size}.`
      : `The ${user.name} missed the postseason.`,
    mine: true,
  });
  for (const p of state.players) p.fatigue = 0;
}

function playGame(state: SeasonState, game: ScheduledGame, teams: Map<number, Team>): PlayedGame {
  const { league } = state;
  const home = teams.get(game.homeId)!;
  const away = teams.get(game.awayId)!;
  const withLog = home.id === state.userTeamId || away.id === state.userTeamId;
  const result = simGame(
    teamInput(state, away),
    teamInput(state, home),
    league.settings.designatedHitter,
    new Rng(`${state.seed}-${league.season}-${game.id}`),
    withLog,
    (state.norms ??= computeNorms(state.players)),
  );
  game.played = true;
  game.homeScore = result.home.runs;
  game.awayScore = result.away.runs;
  game.innings = result.innings;
  return { game, result };
}

function applyWorkload(state: SeasonState, result: GameResult, countStats: boolean, players: Map<number, Player>): void {
  for (const box of [result.home, result.away]) {
    if (countStats) {
      for (const b of box.batters) addLine(statsFor(state, players.get(b.playerId)!).bat, b.line);
    }
    for (const p of box.pitchers) {
      const player = players.get(p.playerId)!;
      if (countStats) addLine(statsFor(state, player).pit, p.line);
      player.fatigue += p.line.pitches + (p.line.gs ? 0 : 10);
    }
  }
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/** Rest and heal for the days that pass (off days included). */
function recover(state: SeasonState, days: number): void {
  for (const p of state.players) {
    if (p.fatigue > 0) p.fatigue = Math.max(0, p.fatigue - (p.position === 'SP' ? RECOVERY.SP : RECOVERY.RP) * days);
    if (p.injury) {
      p.injury.days -= days;
      if (p.injury.days <= 0) {
        if (p.teamId === state.userTeamId) {
          addNews(state.league, { kind: 'team', title: `${p.firstName} ${p.lastName} is healthy`, body: `Back from ${p.injury.description}.`, playerId: p.id, mine: true });
        }
        p.injury = null;
      }
    }
  }
}

function simPlayoffDay(state: SeasonState, teams: Map<number, Team>): PlayedGame[] {
  const { league } = state;
  const players = new Map(state.players.map((p) => [p.id, p]));
  const playoffs = league.playoffs!;
  const played: PlayedGame[] = [];
  let nextId = Math.max(league.season * 10000 + 9000, ...state.schedule.map((g) => g.id)) + 1;
  for (const series of activeSeries(playoffs)) {
    const game = nextSeriesGame(series, nextId++, league.date);
    state.schedule.push(game);
    const pg = playGame(state, game, teams);
    applyWorkload(state, pg.result, false, players);
    applyInjuries(state, game, pg.result, players);
    const winner = game.homeScore! > game.awayScore! ? game.homeId : game.awayId;
    recordSeriesGame(series, winner);
    if (series.winnerId !== null) {
      const w = teams.get(series.winnerId)!;
      const l = teams.get(series.winnerId === series.highId ? series.lowId! : series.highId!)!;
      const wins = Math.max(series.highWins, series.lowWins);
      const losses = Math.min(series.highWins, series.lowWins);
      addNews(league, {
        kind: 'league',
        title: `${w.city} win the ${roundName(series)}`,
        body: `${w.city} ${w.name} defeat the ${l.name}, ${wins}–${losses}.`,
        teamId: w.id,
        mine: w.id === state.userTeamId || l.id === state.userTeamId,
      });
    }
    played.push(pg);
  }
  advanceBracket(playoffs, state.teams);
  if (playoffs.championId !== null) {
    const champ = teams.get(playoffs.championId)!;
    addNews(league, {
      kind: 'league',
      title: `${champ.city} ${champ.name} are ${league.season} champions!`,
      teamId: champ.id,
      mine: champ.id === state.userTeamId,
    });
  }
  return played;
}

/**
 * Simulate one day: regular-season games, or the next game of every active
 * playoff series. Moves preseason → regular → playoffs automatically.
 */
export function simDay(state: SeasonState): PlayedGame[] {
  startSeason(state);
  if (state.league.phase === 'regular' && seasonOver(state)) startPlayoffs(state);
  const { league } = state;
  const teams = new Map(state.teams.map((t) => [t.id, t]));

  if (league.phase === 'playoffs') {
    if (playoffsOver(state)) return [];
    maintainRosters(state);
    const played = simPlayoffDay(state, teams);
    recover(state, 1);
    league.date = addDays(league.date, 1);
    return played;
  }
  if (league.phase !== 'regular') return [];
  maintainRosters(state);

  const today = state.schedule.filter((g) => g.date === league.date && !g.played);
  const players = new Map(state.players.map((p) => [p.id, p]));
  const played: PlayedGame[] = [];
  for (const game of today) {
    const pg = playGame(state, game, teams);
    const { result } = pg;
    const home = teams.get(game.homeId)!;
    const away = teams.get(game.awayId)!;
    const homeWon = result.home.runs > result.away.runs;
    (homeWon ? home : away).wins++;
    (homeWon ? away : home).losses++;
    home.runsScored += result.home.runs;
    home.runsAllowed += result.away.runs;
    away.runsScored += result.away.runs;
    away.runsAllowed += result.home.runs;
    applyWorkload(state, result, true, players);
    applyInjuries(state, game, result, players);
    played.push(pg);
  }

  const next = state.schedule.find((g) => !g.played);
  const nextDate = next ? (next.date > league.date ? next.date : addDays(league.date, 1)) : addDays(league.date, 1);
  recover(state, Math.max(1, daysBetween(league.date, nextDate)));
  league.date = nextDate;
  return played;
}

