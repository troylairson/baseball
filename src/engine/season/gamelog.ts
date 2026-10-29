import type { GameResult } from '../sim/game';
import type { Hand, League, Player, ScheduledGame } from '../model/types';

/** One game for a hitter on the user's team. Short keys keep saves small. */
export interface BatLog {
  g: number;
  d: string;
  vs: number;
  pa: number;
  ab: number;
  h: number;
  hr: number;
  xbh: number;
  bb: number;
  so: number;
  rbi: number;
}

export interface PitLog {
  g: number;
  d: string;
  vs: number;
  gs: 0 | 1;
  outs: number;
  h: number;
  er: number;
  bb: number;
  so: number;
  hr: number;
  pc: number;
  sv: 0 | 1;
}

export interface TeamLog {
  g: number;
  d: string;
  vs: number;
  rf: number;
  ra: number;
  /** Starter / bullpen outs and earned runs. */
  spOuts: number;
  spEr: number;
  bpOuts: number;
  bpEr: number;
  /** Opposing starter's throwing hand. */
  oppHand: Hand;
  /** 1 = home game (absent in logs recorded before home/road splits). */
  home?: 0 | 1;
}

export interface UserGameLog {
  season: number;
  bat: Record<number, BatLog[]>;
  pit: Record<number, PitLog[]>;
  team: TeamLog[];
}

export function userLog(league: League): UserGameLog {
  if (!league.userLog || league.userLog.season !== league.season) {
    league.userLog = { season: league.season, bat: {}, pit: {}, team: [] };
  }
  return league.userLog;
}

/** Record the user's team's lines from a regular-season game. */
export function recordUserGame(league: League, userTeamId: number, game: ScheduledGame, result: GameResult, players: Map<number, Player>): void {
  const home = game.homeId === userTeamId;
  if (!home && game.awayId !== userTeamId) return;
  const log = userLog(league);
  const mine = home ? result.home : result.away;
  const theirs = home ? result.away : result.home;
  const vs = home ? game.awayId : game.homeId;

  const { spOuts, spEr, bpOuts, bpEr } = appendLines(log, game, vs, mine);
  const oppStarter = theirs.pitchers[0] ? players.get(theirs.pitchers[0].playerId) : undefined;
  log.team.push({ g: game.id, d: game.date, vs, rf: mine.runs, ra: theirs.runs, spOuts, spEr, bpOuts, bpEr, oppHand: oppStarter?.throws ?? 'R', home: home ? 1 : 0 });
}

/** Append one game's batting and pitching lines for a team to a log; returns starter/bullpen splits. */
export function appendLines(
  log: { bat: Record<number, BatLog[]>; pit: Record<number, PitLog[]> },
  game: { id: number; date: string },
  vs: number,
  mine: GameResult['home'],
): { spOuts: number; spEr: number; bpOuts: number; bpEr: number } {
  for (const b of mine.batters) {
    if (b.line.pa === 0) continue;
    (log.bat[b.playerId] ??= []).push({
      g: game.id, d: game.date, vs, pa: b.line.pa, ab: b.line.ab, h: b.line.h, hr: b.line.hr,
      xbh: b.line.d + b.line.t + b.line.hr, bb: b.line.bb, so: b.line.so, rbi: b.line.rbi,
    });
  }
  let spOuts = 0;
  let spEr = 0;
  let bpOuts = 0;
  let bpEr = 0;
  mine.pitchers.forEach((p, i) => {
    (log.pit[p.playerId] ??= []).push({
      g: game.id, d: game.date, vs, gs: p.line.gs ? 1 : 0, outs: p.line.outs, h: p.line.h, er: p.line.er,
      bb: p.line.bb, so: p.line.so, hr: p.line.hr, pc: p.line.pitches, sv: p.line.sv ? 1 : 0,
    });
    if (i === 0) {
      spOuts += p.line.outs;
      spEr += p.line.er;
    } else {
      bpOuts += p.line.outs;
      bpEr += p.line.er;
    }
  });
  return { spOuts, spEr, bpOuts, bpEr };
}
