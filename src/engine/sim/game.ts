import { emptyBatting, emptyPitching, type BattingLine, type PitchingLine } from '../model/stats';
import type { BattingRatings, FieldPosition, PitchingRatings, Player, Team } from '../model/types';
import { BASE_NORMS, type RatingNorms } from './norms';
import type { Rng } from '../rng';
import { defenseAt, type GamePlan, type LineupSlot } from './lineup';
import { pitchesFor, resolvePa, type PaResult } from './pa';

export interface TeamGameInput {
  team: Team;
  /** Active roster (MLB level). */
  roster: Player[];
  plan: GamePlan;
  starterId: number;
}

export interface BoxBatter {
  playerId: number;
  position: LineupSlot['position'];
  line: BattingLine;
}

export interface BoxPitcher {
  playerId: number;
  line: PitchingLine;
}

export interface TeamBox {
  teamId: number;
  batters: BoxBatter[];
  pitchers: BoxPitcher[];
  runs: number;
  hits: number;
  errors: number;
  /** Runs per inning. */
  innings: number[];
}

export interface GameResult {
  away: TeamBox;
  home: TeamBox;
  innings: number;
  winningPitcher: number | null;
  losingPitcher: number | null;
  savePitcher: number | null;
  /** Play-by-play, one entry per event (only when requested). */
  log: string[];
}

interface Runner {
  id: number;
  /** Pitcher charged if this runner scores. */
  pitcherId: number;
  earned: boolean;
}

interface Appearance {
  playerId: number;
  line: PitchingLine;
  /** Fielding team's lead when the pitcher entered. */
  leadAtEntry: number;
  role: 'SP' | 'CL' | 'SU' | 'MR';
  /** Outs in the current inning of this appearance's start; used for one-inning relievers. */
  outsAtEntry: number;
}

interface Side {
  input: TeamGameInput;
  players: Map<number, Player>;
  lineup: LineupSlot[];
  batters: Map<number, BoxBatter>;
  order: BoxBatter[];
  batterIdx: number;
  pitchers: Appearance[];
  defense: number;
  catcherArm: number;
  runs: number;
  hits: number;
  errors: number;
  innings: number[];
  /** Pitcher of record when this team last took the lead, and the opposing pitcher charged. */
  goAhead: { winner: number; loser: number } | null;
}

const DEFENSE_WEIGHT: Record<FieldPosition, number> = { C: 1.4, SS: 1.4, CF: 1.3, '2B': 1.2, '3B': 1.0, RF: 0.9, LF: 0.8, '1B': 0.6 };
const DIRECTIONS = ['left', 'left-center', 'center', 'right-center', 'right'];

export function pitchLimit(p: Player, starter: boolean): number {
  const stamina = p.pitching?.stamina ?? 30;
  return starter ? 45 + stamina * 0.75 : 10 + stamina * 0.6;
}

export const RELIEVER_TIRED = 40;

function teamDefense(lineup: LineupSlot[], players: Map<number, Player>): number {
  let sum = 0;
  let weight = 0;
  for (const slot of lineup) {
    if (slot.position === 'DH' || slot.position === 'P') continue;
    const w = DEFENSE_WEIGHT[slot.position];
    sum += defenseAt(players.get(slot.playerId)!, slot.position) * w;
    weight += w;
  }
  return weight ? sum / weight : 50;
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export function simGame(
  awayIn: TeamGameInput, homeIn: TeamGameInput, useDH: boolean, rng: Rng, withLog = false, norms: RatingNorms = BASE_NORMS,
): GameResult {
  const log: string[] = [];
  // Shift ratings so the league average of this era plays like the calibrated baseline.
  const shift = {
    contact: norms.contact - BASE_NORMS.contact, power: norms.power - BASE_NORMS.power, eye: norms.eye - BASE_NORMS.eye,
    stuff: norms.stuff - BASE_NORMS.stuff, control: norms.control - BASE_NORMS.control, movement: norms.movement - BASE_NORMS.movement,
  };
  const batCache = new Map<number, BattingRatings>();
  const batRatings = (p: Player): BattingRatings => {
    let r = batCache.get(p.id);
    if (!r) {
      r = { ...p.batting, contact: p.batting.contact - shift.contact, power: p.batting.power - shift.power, eye: p.batting.eye - shift.eye };
      batCache.set(p.id, r);
    }
    return r;
  };
  const say = (s: string) => withLog && log.push(s);

  const makeSide = (input: TeamGameInput): Side => {
    const players = new Map(input.roster.map((p) => [p.id, p]));
    const lineup = [...input.plan.lineup];
    if (!useDH) {
      // The starting pitcher bats ninth.
      lineup.splice(8, lineup.length - 8, { playerId: input.starterId, position: 'P' });
    }
    const order = lineup.map((s) => ({ playerId: s.playerId, position: s.position, line: { ...emptyBatting(), g: 1 } }));
    const catcher = lineup.find((s) => s.position === 'C');
    return {
      input,
      players,
      lineup,
      batters: new Map(order.map((b) => [b.playerId, b])),
      order,
      batterIdx: 0,
      pitchers: [],
      defense: teamDefense(lineup, players),
      catcherArm: catcher ? players.get(catcher.playerId)!.fielding.arm : 45,
      runs: 0,
      hits: 0,
      errors: 0,
      innings: [],
      goAhead: null,
    };
  };

  const away = makeSide(awayIn);
  const home = makeSide(homeIn);

  const enter = (side: Side, playerId: number, role: Appearance['role'], lead: number, outs: number) => {
    const line = { ...emptyPitching(), g: 1, gs: role === 'SP' ? 1 : 0 };
    side.pitchers.push({ playerId, line, leadAtEntry: lead, role, outsAtEntry: outs });
    // Without a DH the new pitcher takes over the pitcher's lineup slot.
    const slot = side.order.findIndex((b) => b.position === 'P');
    if (slot >= 0 && role !== 'SP') {
      const entry = { playerId, position: 'P' as const, line: { ...emptyBatting(), g: 1 } };
      side.order[slot] = entry;
      side.batters.set(playerId, entry);
      side.lineup[slot] = { playerId, position: 'P' };
    }
  };
  enter(away, awayIn.starterId, 'SP', 0, 0);
  enter(home, homeIn.starterId, 'SP', 0, 0);

  const current = (side: Side) => side.pitchers[side.pitchers.length - 1]!;
  const name = (side: Side, id: number) => {
    const p = side.players.get(id)!;
    return `${p.firstName[0]}. ${p.lastName}`;
  };

  /** Pitcher ratings after in-game fatigue and lingering workload. */
  const effective = (side: Side, app: Appearance): PitchingRatings => {
    const p = side.players.get(app.playerId)!;
    const base = p.pitching ?? { stuff: 25, control: 30, movement: 25, stamina: 20 };
    const over = Math.max(0, app.line.pitches - pitchLimit(p, app.role === 'SP'));
    const tired = over * 0.5 + Math.max(0, p.fatigue - 20) * 0.15;
    return {
      stuff: base.stuff - tired - shift.stuff,
      control: base.control - tired * 0.8 - shift.control,
      movement: base.movement - tired * 0.8 - shift.movement,
      stamina: base.stamina,
    };
  };

  const used = (side: Side) => new Set(side.pitchers.map((a) => a.playerId));

  /** Choose and bring in a reliever. Returns false if nobody is available. */
  const callBullpen = (side: Side, inning: number, lead: number, outs: number): boolean => {
    const { plan } = side.input;
    const gone = used(side);
    const ok = (id: number | null): id is number => {
      if (id === null || gone.has(id)) return false;
      const p = side.players.get(id);
      return !!p && p.fatigue < RELIEVER_TIRED;
    };
    let pick: number | undefined;
    let role: Appearance['role'] = 'MR';
    if (inning >= 9 && lead >= 0 && lead <= 3 && ok(plan.closer)) {
      pick = plan.closer;
      role = 'CL';
    } else if (inning >= 8 && lead >= 0 && lead <= 3) {
      pick = plan.setup.find(ok);
      role = 'SU';
    }
    if (pick === undefined) {
      const middle = plan.middle.filter(ok);
      // Mop-up duty goes to the back of the bullpen.
      pick = Math.abs(lead) >= 5 ? middle[middle.length - 1] : middle[0];
      role = 'MR';
    }
    if (pick === undefined) pick = [...plan.setup, plan.closer].find(ok) ?? undefined;
    if (pick === undefined) {
      // Emergency: anyone who hasn't pitched today, most rested first.
      pick = side.input.roster
        .filter((p) => p.pitching && !gone.has(p.id) && p.id !== side.input.starterId)
        .sort((a, b) => a.fatigue - b.fatigue)[0]?.id;
    }
    if (pick === undefined) return false;
    say(`Pitching change: ${name(side, pick)} replaces ${name(side, current(side).playerId)}.`);
    enter(side, pick, role, lead, outs);
    return true;
  };

  /** Decide whether the fielding team changes pitchers. */
  const managePitcher = (field: Side, inning: number, lead: number, outs: number, startOfInning: boolean) => {
    const app = current(field);
    const p = field.players.get(app.playerId)!;
    const limit = pitchLimit(p, app.role === 'SP');
    const pitches = app.line.pitches;
    let pull: boolean;
    if (app.role === 'SP') {
      if (startOfInning) {
        pull = pitches >= limit - 8 || app.line.r >= 6 || (app.line.r >= 5 && pitches >= 60)
          || (inning >= 8 && lead >= 0 && lead <= 3 && pitches >= limit * 0.8);
      } else {
        pull = pitches >= limit + 12 || app.line.r >= 7;
      }
    } else if (startOfInning) {
      const outsThisOuting = app.line.outs;
      pull = app.role === 'CL' || app.role === 'SU' ? outsThisOuting >= 3 : outsThisOuting >= 6 || pitches >= limit * 0.7;
    } else {
      pull = pitches >= limit + 5;
    }
    if (pull) callBullpen(field, inning, lead, outs);
  };

  let inning = 0;
  let gameOver = false;

  while (!gameOver) {
    inning++;
    for (const half of ['top', 'bottom'] as const) {
      const bat = half === 'top' ? away : home;
      const field = half === 'top' ? home : away;
      if (half === 'bottom' && inning >= 9 && home.runs > away.runs) {
        gameOver = true;
        break;
      }
      say(`${half === 'top' ? 'Top' : 'Bottom'} ${ordinal(inning)} — ${bat.input.team.city} batting`);

      let outs = 0;
      const bases: (Runner | null)[] = [null, null, null];
      let inningRuns = 0;
      if (inning > 1 || half === 'bottom') managePitcher(field, inning, field.runs - bat.runs, 0, true);

      const score = (runner: Runner, batterId: number | null, earned = true) => {
        const leadBefore = bat.runs - field.runs;
        bat.runs++;
        inningRuns++;
        const rb = bat.batters.get(runner.id);
        if (rb) rb.line.r++;
        if (batterId !== null) bat.batters.get(batterId)!.line.rbi++;
        const charged = field.pitchers.find((a) => a.playerId === runner.pitcherId) ?? current(field);
        charged.line.r++;
        if (runner.earned && earned) charged.line.er++;
        if (leadBefore === 0) {
          bat.goAhead = { winner: current(bat).playerId, loser: charged.playerId };
        }
        say(`  ${name(bat, runner.id)} scores.`);
      };

      const walkoff = () => half === 'bottom' && inning >= 9 && home.runs > away.runs;

      while (outs < 3) {
        if (outs > 0 || bases.some(Boolean)) managePitcher(field, inning, field.runs - bat.runs, outs, false);
        const app = current(field);
        const pitcher = field.players.get(app.playerId)!;

        // Stolen base attempt: runner on first, second open.
        const onFirst = bases[0];
        if (onFirst && !bases[1] && outs < 2) {
          const runner = bat.players.get(onFirst.id)!;
          const speed = runner.batting.speed;
          if (speed > 40 && rng.chance((speed - 40) * 0.012)) {
            const line = bat.batters.get(onFirst.id)!.line;
            if (rng.chance(0.72 + (speed - 55) * 0.007 - (field.catcherArm - 50) * 0.004)) {
              line.sb++;
              bases[1] = onFirst;
              bases[0] = null;
              say(`  ${name(bat, onFirst.id)} steals second.`);
            } else {
              line.cs++;
              bases[0] = null;
              outs++;
              app.line.outs++;
              say(`  ${name(bat, onFirst.id)} caught stealing.`);
              continue;
            }
          }
        }

        const slot = bat.order[bat.batterIdx]!;
        bat.batterIdx = (bat.batterIdx + 1) % bat.order.length;
        const batter = bat.players.get(slot.playerId)!;
        const result: PaResult = resolvePa(
          { bat: batRatings(batter), bats: batter.bats, pitch: effective(field, app), throws: pitcher.throws, defense: field.defense },
          rng,
        );
        const b = slot.line;
        const pl = app.line;
        b.pa++;
        pl.bf++;
        pl.pitches += pitchesFor(result, rng);
        const who = name(bat, batter.id);
        const dir = rng.pick(DIRECTIONS);
        const newRunner = (earned = true): Runner => ({ id: batter.id, pitcherId: app.playerId, earned });

        switch (result) {
          case 'K':
            b.ab++;
            b.so++;
            pl.so++;
            pl.outs++;
            outs++;
            say(`${who} strikes out ${rng.chance(0.25) ? 'looking' : 'swinging'}.`);
            break;
          case 'BB':
          case 'HBP': {
            if (result === 'BB') {
              b.bb++;
              pl.bb++;
            } else {
              b.hbp++;
              pl.hbp++;
            }
            say(result === 'BB' ? `${who} walks.` : `${who} is hit by a pitch.`);
            // Force advances only.
            if (bases[0]) {
              if (bases[1]) {
                if (bases[2]) score(bases[2], batter.id);
                bases[2] = bases[1];
              }
              bases[1] = bases[0];
            }
            bases[0] = newRunner();
            break;
          }
          case 'HR': {
            b.ab++;
            b.h++;
            b.hr++;
            pl.h++;
            pl.hr++;
            bat.hits++;
            const n = bases.filter(Boolean).length + 1;
            say(`${who} homers to ${dir}${n === 4 ? ' — grand slam!' : n > 1 ? ` (${n} runs).` : '.'}`);
            for (let i = 2; i >= 0; i--) {
              if (bases[i]) score(bases[i]!, batter.id);
              bases[i] = null;
            }
            score(newRunner(), batter.id);
            break;
          }
          case '1B':
          case '2B':
          case '3B': {
            b.ab++;
            b.h++;
            pl.h++;
            bat.hits++;
            if (result === '2B') b.d++;
            if (result === '3B') b.t++;
            say(`${who} ${result === '1B' ? 'singles' : result === '2B' ? 'doubles' : 'triples'} to ${dir}.`);
            const spd = (r: Runner) => bat.players.get(r.id)!.batting.speed;
            const [r1, r2, r3] = bases;
            bases[0] = bases[1] = bases[2] = null;
            if (r3) score(r3, batter.id);
            if (result === '1B') {
              if (r2) {
                if (rng.chance(0.6 + (spd(r2) - 50) * 0.01)) score(r2, batter.id);
                else bases[2] = r2;
              }
              if (r1) {
                if (!bases[2] && rng.chance(0.27 + (spd(r1) - 50) * 0.008)) bases[2] = r1;
                else bases[1] = r1;
              }
              bases[0] = newRunner();
            } else if (result === '2B') {
              if (r2) score(r2, batter.id);
              if (r1) {
                if (rng.chance(0.42 + (spd(r1) - 50) * 0.01)) score(r1, batter.id);
                else bases[2] = r1;
              }
              bases[1] = newRunner();
            } else {
              if (r2) score(r2, batter.id);
              if (r1) score(r1, batter.id);
              bases[2] = newRunner();
            }
            break;
          }
          case 'E': {
            b.ab++;
            field.errors++;
            say(`${who} reaches on an error.`);
            const [r1, r2, r3] = bases;
            bases[0] = bases[1] = bases[2] = null;
            if (r3) score(r3, null, false);
            if (r2) bases[2] = r2;
            if (r1) bases[1] = r1;
            bases[0] = newRunner(false);
            break;
          }
          case 'GO': {
            const [r1, r2, r3] = bases;
            const speed = batter.batting.speed;
            if (r1 && outs < 2 && rng.chance(0.45 - (speed - 50) * 0.008)) {
              b.ab++;
              b.gidp++;
              outs += 2;
              pl.outs += 2;
              bases[0] = null;
              say(`${who} grounds into a double play.`);
              if (outs < 3) {
                bases[2] = r2 ?? null;
                bases[1] = null;
                if (r3) score(r3, null);
              }
              break;
            }
            b.ab++;
            outs++;
            pl.outs++;
            say(`${who} grounds out.`);
            if (outs < 3) {
              if (r3 && rng.chance(0.5)) {
                bases[2] = null;
                score(r3, batter.id);
              }
              if (r2 && !bases[2] && rng.chance(0.6)) {
                bases[2] = r2;
                bases[1] = null;
              }
              if (r1) {
                if (!bases[1]) {
                  bases[1] = r1;
                  bases[0] = null;
                }
              }
            }
            break;
          }
          case 'FO':
          case 'LO': {
            const r3 = bases[2];
            if (result === 'FO' && r3 && outs < 2 && rng.chance(0.55 + (bat.players.get(r3.id)!.batting.speed - 50) * 0.01)) {
              b.sf++;
              outs++;
              pl.outs++;
              say(`${who} hits a sacrifice fly to ${dir}.`);
              bases[2] = null;
              score(r3, batter.id);
              break;
            }
            b.ab++;
            outs++;
            pl.outs++;
            say(result === 'FO' ? `${who} flies out to ${dir}.` : `${who} lines out.`);
            if (result === 'FO' && outs < 3 && bases[1] && !bases[2] && rng.chance(0.25)) {
              bases[2] = bases[1];
              bases[1] = null;
            }
            break;
          }
        }

        if (walkoff()) {
          gameOver = true;
          say(`${bat.input.team.city} wins it on a walk-off!`);
          break;
        }
      }
      bat.innings.push(inningRuns);
      if (gameOver) break;
      if (half === 'bottom' && inning >= 9 && home.runs !== away.runs) gameOver = true;
    }
  }

  // Pitching decisions.
  const winner = home.runs > away.runs ? home : away;
  const loser = winner === home ? away : home;
  let winningPitcher: number | null = null;
  let losingPitcher: number | null = null;
  let savePitcher: number | null = null;
  if (winner.goAhead) {
    winningPitcher = winner.goAhead.winner;
    losingPitcher = winner.goAhead.loser;
    const starter = winner.pitchers[0]!;
    if (winningPitcher === starter.playerId && starter.line.outs < 15 && winner.pitchers.length > 1) {
      // A starter needs five innings; credit the most effective reliever instead.
      winningPitcher = [...winner.pitchers.slice(1)].sort((a, b) => b.line.outs - a.line.outs)[0]!.playerId;
    }
    const finisher = winner.pitchers[winner.pitchers.length - 1]!;
    if (
      finisher.playerId !== winningPitcher &&
      finisher.leadAtEntry > 0 &&
      ((finisher.leadAtEntry <= 3 && finisher.line.outs >= 3) || finisher.line.outs >= 9)
    ) {
      savePitcher = finisher.playerId;
    }
  }
  for (const app of winner.pitchers) {
    if (app.playerId === winningPitcher) app.line.w = 1;
    if (app.playerId === savePitcher) app.line.sv = 1;
  }
  for (const app of loser.pitchers) if (app.playerId === losingPitcher) app.line.l = 1;

  const box = (side: Side): TeamBox => {
    // Batters who left the lineup (pitchers replaced in the P slot) are kept.
    const batters = [...side.batters.values()];
    return {
      teamId: side.input.team.id,
      batters,
      pitchers: side.pitchers.map((a) => ({ playerId: a.playerId, line: a.line })),
      runs: side.runs,
      hits: side.hits,
      errors: side.errors,
      innings: side.innings,
    };
  };

  return {
    away: box(away),
    home: box(home),
    innings: inning,
    winningPitcher,
    losingPitcher,
    savePitcher,
    log,
  };
}
