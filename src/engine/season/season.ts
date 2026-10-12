import { addLine, emptyBatting, emptyPitching, type PlayerSeasonStats } from '../model/stats';
import type { League, Player, ScheduledGame, Team } from '../model/types';
import { Rng } from '../rng';
import { simGame, type GameResult, type TeamGameInput } from '../sim/game';
import { autoPlan, type GamePlan } from '../sim/lineup';
import { addDays } from './schedule';

export interface SeasonState {
  league: League;
  teams: Team[];
  players: Player[];
  schedule: ScheduledGame[];
  stats: Map<number, PlayerSeasonStats>;
  userTeamId: number;
  seed: number;
}

export interface PlayedGame {
  game: ScheduledGame;
  result: GameResult;
}

/** Pitchers fit to start must be at or below this workload. */
export const STARTER_READY = 25;
const RECOVERY = { SP: 20, RP: 12 };

export function seasonOver(state: SeasonState): boolean {
  return state.schedule.every((g) => g.played);
}

export function nextGameFor(state: SeasonState, teamId: number): ScheduledGame | undefined {
  return state.schedule.find((g) => !g.played && (g.homeId === teamId || g.awayId === teamId));
}

export function activeRoster(players: Player[], teamId: number): Player[] {
  return players.filter((p) => p.teamId === teamId && p.level === 'MLB');
}

export function planFor(state: SeasonState, teamId: number): GamePlan {
  return autoPlan(activeRoster(state.players, teamId), state.league.settings.designatedHitter);
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
  const plan = autoPlan(roster, state.league.settings.designatedHitter);
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

/** Simulate every game on the current date, then advance one day. */
export function simDay(state: SeasonState): PlayedGame[] {
  startSeason(state);
  if (state.league.phase !== 'regular' || seasonOver(state)) return [];
  const { league } = state;
  const teams = new Map(state.teams.map((t) => [t.id, t]));
  const players = new Map(state.players.map((p) => [p.id, p]));
  const today = state.schedule.filter((g) => g.date === league.date && !g.played);
  const played: PlayedGame[] = [];

  for (const game of today) {
    const home = teams.get(game.homeId)!;
    const away = teams.get(game.awayId)!;
    const withLog = home.id === state.userTeamId || away.id === state.userTeamId;
    const result = simGame(
      teamInput(state, away),
      teamInput(state, home),
      league.settings.designatedHitter,
      new Rng(`${state.seed}-${league.season}-${game.id}`),
      withLog,
    );

    game.played = true;
    game.homeScore = result.home.runs;
    game.awayScore = result.away.runs;
    game.innings = result.innings;
    const homeWon = result.home.runs > result.away.runs;
    (homeWon ? home : away).wins++;
    (homeWon ? away : home).losses++;
    home.runsScored += result.home.runs;
    home.runsAllowed += result.away.runs;
    away.runsScored += result.away.runs;
    away.runsAllowed += result.home.runs;

    for (const box of [result.home, result.away]) {
      for (const b of box.batters) addLine(statsFor(state, players.get(b.playerId)!).bat, b.line);
      for (const p of box.pitchers) {
        const player = players.get(p.playerId)!;
        addLine(statsFor(state, player).pit, p.line);
        player.fatigue += p.line.pitches + (p.line.gs ? 0 : 10);
      }
    }
    played.push({ game, result });
  }

  for (const p of state.players) {
    if (p.fatigue > 0) p.fatigue = Math.max(0, p.fatigue - (p.position === 'SP' ? RECOVERY.SP : RECOVERY.RP));
  }
  const next = state.schedule.find((g) => !g.played);
  league.date = next ? (next.date > league.date ? next.date : addDays(league.date, 1)) : league.date;
  return played;
}
