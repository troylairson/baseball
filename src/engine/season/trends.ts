import { isPitcher, overall, pitchingOverall } from '../model/ratings';
import { addLine, avg, emptyBatting, era, ipString, rate3 } from '../model/stats';
import { DEFAULT_STRATEGY, type FieldPosition, type Hand, type Player, type TeamStrategy } from '../model/types';
import { autoPlan, fitAt, resolvePlan, type GamePlan } from '../sim/lineup';
import { chemistryFactors, chemistryLabel, isBadApple } from './chemistry';
import { userLog, type BatLog, type PitLog, type TeamLog } from './gamelog';
import { activeRoster, type SeasonState } from './season';

export type TrendTone = 'good' | 'bad' | 'info';

export type TrendAction =
  | { kind: 'bench'; playerId: number }
  | { kind: 'battingOrder'; playerId: number; slot: number }
  | { kind: 'swapCloser'; playerId: number }
  | { kind: 'toBullpen'; playerId: number }
  | { kind: 'strategy'; patch: Partial<TeamStrategy> }
  | { kind: 'callUp'; upId: number; downId: number }
  | { kind: 'autoLineup' }
  | { kind: 'platoon'; playerId: number; hand: Hand }
  | { kind: 'unplatoon'; playerId: number }
  | { kind: 'goto'; path: string };

export interface TrendSuggestion {
  label: string;
  action?: TrendAction;
}

export interface Trend {
  id: string;
  tone: TrendTone;
  playerId?: number;
  title: string;
  /** What happened, with numbers. */
  detail: string;
  /** How it compares, and what it probably means. */
  context?: string;
  suggestions: TrendSuggestion[];
  /** Higher = more important. */
  priority: number;
}

const name = (p: Player) => `${p.firstName} ${p.lastName}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

interface BatSum { pa: number; ab: number; h: number; hr: number; bb: number; so: number; xbh: number }
function sumBat(logs: BatLog[]): BatSum {
  return logs.reduce((s, l) => ({ pa: s.pa + l.pa, ab: s.ab + l.ab, h: s.h + l.h, hr: s.hr + l.hr, bb: s.bb + l.bb, so: s.so + l.so, xbh: s.xbh + l.xbh }),
    { pa: 0, ab: 0, h: 0, hr: 0, bb: 0, so: 0, xbh: 0 });
}
interface PitSum { outs: number; er: number; h: number; bb: number; so: number; hr: number }
function sumPit(logs: PitLog[]): PitSum {
  return logs.reduce((s, l) => ({ outs: s.outs + l.outs, er: s.er + l.er, h: s.h + l.h, bb: s.bb + l.bb, so: s.so + l.so, hr: s.hr + l.hr }),
    { outs: 0, er: 0, h: 0, bb: 0, so: 0, hr: 0 });
}
const eraOf = (s: { outs: number; er: number }) => (s.outs ? (s.er * 27) / s.outs : 0);
const per9 = (n: number, outs: number) => (outs ? (n * 27) / outs : 0);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/** Season and career averages for context lines. */
function batContext(p: Player, state: SeasonState): { season: number; career: number | null; seasonK: number } {
  const s = state.stats.get(p.id)?.bat ?? emptyBatting();
  const career = emptyBatting();
  if (p.career) addLine(career, p.career.bat);
  addLine(career, s);
  return { season: avg(s), career: p.career && p.career.bat.ab >= 300 ? avg(career) : null, seasonK: s.pa ? s.so / s.pa : 0 };
}

function lineupIndex(plan: GamePlan, id: number): number {
  return plan.lineup.filter((s) => s.position !== 'P').findIndex((s) => s.playerId === id);
}

// ---------------------------------------------------------------------------

/** A AAA bat who can play his position and would hit at least as well. */
function minorLeagueBat(state: SeasonState, p: Player): Player | undefined {
  return state.players
    .filter((x) => x.teamId === state.userTeamId && x.level === 'AAA' && !x.injury && !isPitcher(x)
      && (p.position === 'DH' || x.positionRatings[p.position as FieldPosition] !== undefined))
    .filter((x) => overall(x) >= overall(p) - 1)
    .sort((a, b) => overall(b) - overall(a))[0];
}

const shortDate = (d: string) => {
  const [, m, day] = d.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m! - 1]} ${day}`;
};

function hitterTrends(p: Player, logs: BatLog[], state: SeasonState, plan: GamePlan, teamLogs: TeamLog[]): Trend[] {
  const out: Trend[] = [];
  if (logs.length < 5) return out;
  const ctx = batContext(p, state);
  const contextLine = `${rate3(ctx.season)} on the season${ctx.career !== null ? `, ${rate3(ctx.career)} career` : ''}`;
  const slot = lineupIndex(plan, p.id);
  const starting = slot >= 0;

  // Hitless streak (most recent games without a hit).
  let games = 0;
  let ab = 0;
  for (let i = logs.length - 1; i >= 0 && logs[i]!.h === 0; i--) {
    if (logs[i]!.ab === 0) continue;
    games++;
    ab += logs[i]!.ab;
  }
  if (games >= 3 && ab >= 10) {
    out.push({
      id: `hitless-${p.id}`,
      tone: 'bad',
      playerId: p.id,
      title: `${name(p)} is 0-for-${ab}`,
      detail: `No hits in his last ${games} games.`,
      context: ctx.season < 0.22
        ? `He's only hitting ${rate3(ctx.season)} on the season${ctx.career !== null ? ` (${rate3(ctx.career)} career)` : ''}; this may be more than a cold spell.`
        : `He's hitting ${contextLine}, so a hot week is probably coming.`,
      suggestions: [
        ...(starting ? [{ label: 'Give him a day off', action: { kind: 'bench', playerId: p.id } as TrendAction }] : []),
        ...(starting && slot <= 4 ? [{ label: 'Drop him to 7th', action: { kind: 'battingOrder', playerId: p.id, slot: 6 } as TrendAction }] : []),
        ...(ctx.season < 0.22 ? [{ label: 'Look for an upgrade', action: { kind: 'goto', path: '/play/trades' } as TrendAction }] : []),
      ],
      priority: 60 + ab,
    });
  }

  // Ten-game window: slump or hot streak.
  const last = sumBat(logs.slice(-10));
  if (last.ab >= 28 && games < 3) {
    const a10 = last.h / last.ab;
    const k10 = last.pa ? last.so / last.pa : 0;
    if (a10 <= ctx.season - 0.07 && a10 < 0.2) {
      const decline = k10 - ctx.seasonK > 0.07;
      out.push({
        id: `slump-${p.id}`,
        tone: 'bad',
        playerId: p.id,
        title: `${name(p)} is slumping`,
        detail: `Hitting ${rate3(a10)} (${last.h}-for-${last.ab}) over his last 10 games, since ${shortDate(logs.at(-10)?.d ?? logs[0]!.d)}.`,
        context: `${contextLine[0]!.toUpperCase()}${contextLine.slice(1)}. ${
          decline
            ? `His strikeout rate has jumped to ${pct(k10)} (${pct(ctx.seasonK)} on the season) — something is off.`
            : `His strikeout rate (${pct(k10)}) hasn't changed much, so this looks like bad luck on balls in play.`
        }`,
        suggestions: decline
          ? [
              ...(starting ? [{ label: 'Rest him', action: { kind: 'bench', playerId: p.id } as TrendAction }] : []),
              ...(starting && slot <= 4 ? [{ label: 'Drop him to 7th', action: { kind: 'battingOrder', playerId: p.id, slot: 6 } as TrendAction }] : []),
              ...(() => {
                const up = minorLeagueBat(state, p);
                return up ? [{ label: `Call up ${name(up)} (AAA)`, action: { kind: 'callUp', upId: up.id, downId: p.id } as TrendAction }] : [];
              })(),
            ]
          : [
              { label: 'Ride it out' },
              ...(starting && slot <= 3 ? [{ label: 'Ease the pressure: bat him 6th', action: { kind: 'battingOrder', playerId: p.id, slot: 5 } as TrendAction }] : []),
            ],
        priority: decline ? 55 : 40,
      });
    } else if (a10 >= 0.35 && a10 >= ctx.season + 0.05) {
      out.push({
        id: `hot-${p.id}`,
        tone: 'good',
        playerId: p.id,
        title: `${name(p)} is on fire`,
        detail: `${rate3(a10)} (${last.h}-for-${last.ab})${last.hr ? ` with ${last.hr} HR` : ''} over his last 10 games.`,
        context: `${contextLine[0]!.toUpperCase()}${contextLine.slice(1)}.`,
        suggestions: starting && slot >= 4
          ? [{ label: 'Move him up to 2nd', action: { kind: 'battingOrder', playerId: p.id, slot: 1 } }]
          : !starting
            ? [{ label: 'Get him in the lineup', action: { kind: 'goto', path: '/play/roster' } }]
            : [],
        priority: 30,
      });
    }
  }

  // Platoon split: results in games against left- vs right-handed starters.
  const hand = new Map(teamLogs.map((t) => [t.g, t.oppHand]));
  const split = (h: Hand) => sumBat(logs.filter((l) => hand.get(l.g) === h));
  const team = state.teams.find((t) => t.id === state.userTeamId)!;
  const platooned = (['L', 'R'] as const).find((h) => team.platoon?.[h].includes(p.id));
  if (starting && !platooned && p.bats !== 'S') {
    const same = p.bats as Hand;
    const vsSame = split(same);
    const vsOther = split(same === 'L' ? 'R' : 'L');
    if (vsSame.ab >= 40 && vsOther.ab >= 40) {
      const aSame = vsSame.h / vsSame.ab;
      const aOther = vsOther.h / vsOther.ab;
      if (aSame <= 0.2 && aOther - aSame >= 0.08) {
        const word = same === 'L' ? 'lefties' : 'righties';
        out.push({
          id: `platoon-${p.id}`,
          tone: 'bad',
          playerId: p.id,
          title: `${name(p)} can't solve ${word}`,
          detail: `${rate3(aSame)} in games against ${same === 'L' ? 'left' : 'right'}-handed starters, ${rate3(aOther)} against ${same === 'L' ? 'righties' : 'lefties'}.`,
          context: `A ${same === 'L' ? 'left' : 'right'}-handed hitter facing same-side pitching. A platoon partner could take those at-bats.`,
          suggestions: [{ label: `Sit him against ${word}`, action: { kind: 'platoon', playerId: p.id, hand: same } }],
          priority: 42,
        });
      }
    }
  }

  // Hitting streak.
  let streak = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i]!.ab === 0 && logs[i]!.h === 0) continue;
    if (logs[i]!.h === 0) break;
    streak++;
  }
  if (streak >= 10) {
    out.push({
      id: `streak-${p.id}`,
      tone: 'good',
      playerId: p.id,
      title: `${name(p)} has a ${streak}-game hitting streak`,
      detail: `A hit in each of his last ${streak} games.`,
      suggestions: [],
      priority: 20 + streak,
    });
  }
  return out;
}

function pitcherTrends(p: Player, logs: PitLog[], state: SeasonState, plan: GamePlan): Trend[] {
  const out: Trend[] = [];
  const season = state.stats.get(p.id)?.pit;
  if (!season || !logs.length) return out;
  const seasonEra = era(season);
  const starts = logs.filter((l) => l.gs);

  if (plan.rotation.includes(p.id) && starts.length >= 4) {
    const last3 = sumPit(starts.slice(-3));
    const e3 = eraOf(last3);
    if (e3 >= 6 && e3 >= seasonEra + 1.5) {
      const bb3 = per9(last3.bb, last3.outs);
      const bbS = per9(season.bb, season.outs);
      const hr3 = per9(last3.hr, last3.outs);
      const diagnosis = bb3 >= bbS + 1.5
        ? `Control is the problem: ${bb3.toFixed(1)} walks per 9 (${bbS.toFixed(1)} on the season).`
        : hr3 >= 2
          ? `He's giving up the long ball: ${hr3.toFixed(1)} HR per 9.`
          : 'Hitters are squaring him up; his workload may be catching up with him.';
      const aaa = bestMinorLeaguer(state, 'SP');
      out.push({
        id: `sp-struggle-${p.id}`,
        tone: 'bad',
        playerId: p.id,
        title: `${name(p)} has been hit hard`,
        detail: `${e3.toFixed(2)} ERA over his last 3 starts (${ipString(last3.outs)} IP).`,
        context: `${seasonEra.toFixed(2)} ERA on the season. ${diagnosis}`,
        suggestions: [
          { label: 'Skip his turn: move him to the bullpen', action: { kind: 'toBullpen', playerId: p.id } },
          ...(aaa && overall(aaa) >= overall(p) - 2 ? [{ label: `Call up ${name(aaa)} (AAA)`, action: { kind: 'callUp', upId: aaa.id, downId: p.id } as TrendAction }] : []),
        ],
        priority: 58,
      });
    } else if (e3 <= 1.5 && last3.outs >= 51) {
      out.push({
        id: `sp-dealing-${p.id}`,
        tone: 'good',
        playerId: p.id,
        title: `${name(p)} is dealing`,
        detail: `${e3.toFixed(2)} ERA and ${last3.so} strikeouts over his last 3 starts.`,
        context: `${seasonEra.toFixed(2)} ERA on the season.`,
        suggestions: (state.teams.find((t) => t.id === state.userTeamId)?.strategy ?? DEFAULT_STRATEGY).starterLeash < 2
          ? [{ label: 'Give your starters a longer leash', action: { kind: 'strategy', patch: { starterLeash: 2 } } }]
          : [],
        priority: 25,
      });
    }
  }

  if (plan.closer === p.id) {
    const recent = logs.slice(-5);
    const s = sumPit(recent);
    if (recent.length >= 4 && s.er >= 5) {
      const setupBest = plan.setup.map((id) => state.players.find((x) => x.id === id)).filter((x): x is Player => !!x)
        .sort((a, b) => pitchingOverall(b.pitching!, false) - pitchingOverall(a.pitching!, false))[0];
      out.push({
        id: `closer-${p.id}`,
        tone: 'bad',
        playerId: p.id,
        title: `Closer ${name(p)} is struggling`,
        detail: `${s.er} earned runs in his last ${recent.length} appearances (${ipString(s.outs)} IP).`,
        context: `${seasonEra.toFixed(2)} ERA on the season.`,
        suggestions: setupBest ? [{ label: `Give ${setupBest.lastName} the 9th`, action: { kind: 'swapCloser', playerId: setupBest.id } }] : [],
        priority: 62,
      });
    }
  }

  if (!plan.rotation.includes(p.id)) {
    const recentDays = logs.filter((l) => daysBetween(l.d, state.league.date) <= 4);
    if (recentDays.length >= 3) {
      out.push({
        id: `workload-${p.id}`,
        tone: 'info',
        playerId: p.id,
        title: `${name(p)} has been worked hard`,
        detail: `${recentDays.length} appearances in the last 4 days (${recentDays.reduce((s, l) => s + l.pc, 0)} pitches).`,
        context: 'Tired relievers lose effectiveness; the manager will try to rest him.',
        suggestions: [],
        priority: 15,
      });
    }
  }
  return out;
}

function bestMinorLeaguer(state: SeasonState, position: 'SP' | 'RP'): Player | undefined {
  return state.players
    .filter((p) => p.teamId === state.userTeamId && p.level === 'AAA' && !p.injury && p.position === position)
    .sort((a, b) => overall(b) - overall(a))[0];
}

function teamTrends(state: SeasonState, logs: TeamLog[]): Trend[] {
  const out: Trend[] = [];
  if (logs.length < 10) return out;
  const team = state.teams.find((t) => t.id === state.userTeamId)!;
  const strategy = team.strategy ?? DEFAULT_STRATEGY;

  // Bullpen over the last 7 games vs the season.
  const pen7 = logs.slice(-7).reduce((s, l) => ({ outs: s.outs + l.bpOuts, er: s.er + l.bpEr }), { outs: 0, er: 0 });
  const penAll = logs.reduce((s, l) => ({ outs: s.outs + l.bpOuts, er: s.er + l.bpEr }), { outs: 0, er: 0 });
  const e7 = eraOf(pen7);
  const eAll = eraOf(penAll);
  if (pen7.outs >= 30 && e7 >= 5.5 && e7 >= eAll + 1.5) {
    const up = bestMinorLeaguer(state, 'RP');
    const worst = activeRoster(state.players, team.id).filter((p) => p.position === 'RP').sort((a, b) => overall(a) - overall(b))[0];
    out.push({
      id: 'bullpen',
      tone: 'bad',
      title: 'The bullpen is struggling',
      detail: `${e7.toFixed(2)} ERA over the last 7 games (${ipString(pen7.outs)} IP).`,
      context: `${eAll.toFixed(2)} bullpen ERA on the season.`,
      suggestions: [
        ...(strategy.starterLeash < 2 ? [{ label: 'Let starters go deeper', action: { kind: 'strategy', patch: { starterLeash: (strategy.starterLeash + 1) as 1 | 2 } } as TrendAction }] : []),
        ...(up && worst && overall(up) > overall(worst) ? [{ label: `Call up ${name(up)} from AAA`, action: { kind: 'callUp', upId: up.id, downId: worst.id } as TrendAction }] : []),
        { label: 'Shop for relief help', action: { kind: 'goto', path: '/play/trades' } },
      ],
      priority: 57,
    });
  }

  // Offense over the last 10 games.
  const runs10 = logs.slice(-10).reduce((s, l) => s + l.rf, 0) / Math.min(10, logs.length);
  const runsAll = logs.reduce((s, l) => s + l.rf, 0) / logs.length;
  if (runs10 <= 3.2 && runs10 <= runsAll - 1) {
    out.push({
      id: 'offense-cold',
      tone: 'bad',
      title: 'The offense has gone cold',
      detail: `${runs10.toFixed(1)} runs per game over the last 10.`,
      context: `${runsAll.toFixed(1)} per game on the season.`,
      suggestions: [
        { label: 'Shake up the lineup (auto)', action: { kind: 'autoLineup' } },
        ...(strategy.baserunning < 2 ? [{ label: 'Run more aggressively', action: { kind: 'strategy', patch: { baserunning: 2 } } as TrendAction }] : []),
      ],
      priority: 50,
    });
  } else if (runs10 >= 6) {
    out.push({
      id: 'offense-hot',
      tone: 'good',
      title: 'The bats are hot',
      detail: `${runs10.toFixed(1)} runs per game over the last 10 (${runsAll.toFixed(1)} on the season).`,
      suggestions: [],
      priority: 20,
    });
  }

  // Win / loss streak.
  let streak = 0;
  const lastWon = logs[logs.length - 1]!.rf > logs[logs.length - 1]!.ra;
  for (let i = logs.length - 1; i >= 0 && (logs[i]!.rf > logs[i]!.ra) === lastWon; i--) streak++;
  if (streak >= 5) {
    out.push({
      id: 'streak',
      tone: lastWon ? 'good' : 'bad',
      title: lastWon ? `${streak}-game winning streak` : `${streak}-game losing streak`,
      detail: lastWon ? 'The clubhouse is rolling.' : 'Morale suffers when the losses pile up.',
      suggestions: lastWon ? [] : [{ label: 'Check the trends below for where it’s going wrong' }],
      priority: lastWon ? 22 : 45,
    });
  }

  // Splits by opposing starter's hand.
  for (const hand of ['L', 'R'] as const) {
    const g = logs.filter((l) => l.oppHand === hand);
    const w = g.filter((l) => l.rf > l.ra).length;
    const overall = logs.filter((l) => l.rf > l.ra).length / logs.length;
    if (g.length >= 8 && w / g.length <= 0.35 && overall >= 0.45) {
      out.push({
        id: `split-${hand}`,
        tone: 'bad',
        title: `${w}-${g.length - w} against ${hand === 'L' ? 'left' : 'right'}-handed starters`,
        detail: `Compared with ${pct(overall)} wins overall.`,
        context: hand === 'L'
          ? 'Lefty-heavy lineups struggle against same-side pitching.'
          : 'Righty-heavy lineups struggle against same-side pitching.',
        suggestions: [{ label: `Look for a ${hand === 'L' ? 'right' : 'left'}-handed bat`, action: { kind: 'goto', path: '/play/trades' } }],
        priority: 35,
      });
    }
  }

  // Home and road.
  const sided = logs.filter((l) => l.home !== undefined);
  const homeG = sided.filter((l) => l.home === 1);
  const roadG = sided.filter((l) => l.home === 0);
  if (homeG.length >= 20 && roadG.length >= 20) {
    const hw = homeG.filter((l) => l.rf > l.ra).length;
    const rw = roadG.filter((l) => l.rf > l.ra).length;
    const gap = hw / homeG.length - rw / roadG.length;
    if (Math.abs(gap) >= 0.22) {
      const roadWorse = gap > 0;
      out.push({
        id: 'home-road',
        tone: 'info',
        title: roadWorse ? `${rw}-${roadG.length - rw} on the road` : `${hw}-${homeG.length - hw} at home`,
        detail: `${hw}-${homeG.length - hw} at home, ${rw}-${roadG.length - rw} on the road.`,
        context: roadWorse
          ? 'Big home/road gaps usually even out; the schedule ahead may be friendlier.'
          : 'Struggling at home costs you at the gate, too: fans notice.',
        suggestions: [],
        priority: 24,
      });
    }
  }

  // One-run games.
  const close = logs.filter((l) => Math.abs(l.rf - l.ra) === 1);
  const cw = close.filter((l) => l.rf > l.ra).length;
  if (close.length >= 8 && cw / close.length <= 0.35) {
    out.push({
      id: 'one-run',
      tone: 'bad',
      title: `${cw}-${close.length - cw} in one-run games`,
      detail: 'Close games are slipping away.',
      context: 'Late-inning relief usually decides these.',
      suggestions: [{ label: 'Review the bullpen roles', action: { kind: 'goto', path: '/play/roster' } }],
      priority: 33,
    });
  }
  return out;
}

function chemistryTrends(state: SeasonState): Trend[] {
  const team = state.teams.find((t) => t.id === state.userTeamId)!;
  const chem = team.chemistry;
  if (chem === undefined) return [];
  const factors = chemistryFactors(state, team.id);
  const label = chemistryLabel(chem);
  if (label === 'Tense' || label === 'Toxic') {
    const apples = state.players.filter((p) => p.teamId === team.id && p.level === 'MLB' && isBadApple(p));
    const worst = factors.filter((f) => f.value < 0).sort((a, b) => a.value - b.value).slice(0, 2);
    return [{
      id: 'chemistry',
      tone: 'bad',
      title: `The clubhouse is ${label.toLowerCase()}`,
      detail: `Team chemistry is ${chem}/100, which costs everyone a little on the field.`,
      context: worst.length ? worst.map((f) => f.label).join('. ') + '.' : undefined,
      suggestions: [
        ...(apples[0] ? [{ label: `Shop ${name(apples[0])}`, action: { kind: 'goto', path: '/play/trades' } as TrendAction }] : []),
        { label: 'See the clubhouse', action: { kind: 'goto', path: '/play/office' } },
      ],
      priority: label === 'Toxic' ? 56 : 44,
    }];
  }
  if (label === 'Great') {
    const best = factors.filter((f) => f.value > 0).sort((a, b) => b.value - a.value)[0];
    return [{
      id: 'chemistry',
      tone: 'good',
      title: 'Great clubhouse chemistry',
      detail: `Team chemistry is ${chem}/100, a small lift for everyone on the field.`,
      context: best ? `${best.label}.` : undefined,
      suggestions: [],
      priority: 18,
    }];
  }
  return [];
}

/** Everything notable about the user's team right now, most important first. */
export function detectTrends(state: SeasonState): Trend[] {
  if (state.league.phase !== 'regular') return [];
  const log = userLog(state.league);
  const team = state.teams.find((t) => t.id === state.userTeamId)!;
  const active = activeRoster(state.players, team.id);
  const plan = resolvePlan(active, team.plan, state.league.settings.designatedHitter);
  const trends: Trend[] = [];
  for (const p of active) {
    if (isPitcher(p)) trends.push(...pitcherTrends(p, log.pit[p.id] ?? [], state, plan));
    else trends.push(...hitterTrends(p, log.bat[p.id] ?? [], state, plan, log.team));
  }
  trends.push(...teamTrends(state, log.team));
  trends.push(...chemistryTrends(state));
  trends.sort((a, b) => b.priority - a.priority);
  // The same team-wide fix shouldn't be offered on several cards.
  const offered = new Set<string>();
  for (const t of trends) {
    t.suggestions = t.suggestions.filter((x) => {
      if (!x.action || x.action.kind !== 'strategy') return true;
      const key = JSON.stringify(x.action);
      if (offered.has(key)) return false;
      offered.add(key);
      return true;
    });
  }
  return trends;
}

// ---------------------------------------------------------------------------
// Acting on a suggestion

export type TrendActionResult = { ok: true; message: string } | { ok: false; reason: string };

/** Apply a suggested response to the user's team. Navigation actions are handled by the UI. */
export function applyTrendAction(state: SeasonState, action: TrendAction): TrendActionResult {
  const team = state.teams.find((t) => t.id === state.userTeamId)!;
  const active = activeRoster(state.players, team.id);
  const useDH = state.league.settings.designatedHitter;
  const plan = resolvePlan(active, team.plan, useDH);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const lineup = plan.lineup.filter((s) => s.position !== 'P');

  switch (action.kind) {
    case 'bench': {
      const idx = lineup.findIndex((s) => s.playerId === action.playerId);
      if (idx < 0) return { ok: false, reason: "He isn't in the lineup." };
      const slot = lineup[idx]!;
      const used = new Set(lineup.map((s) => s.playerId));
      const sub = active
        .filter((p) => !isPitcher(p) && !used.has(p.id))
        .sort((a, b) => fitAt(b, slot.position === 'P' ? 'DH' : slot.position) - fitAt(a, slot.position === 'P' ? 'DH' : slot.position))[0];
      if (!sub) return { ok: false, reason: 'Nobody on the bench can take his place.' };
      lineup[idx] = { playerId: sub.id, position: slot.position };
      team.plan = { ...plan, lineup };
      return { ok: true, message: `${byId.get(sub.id)!.lastName} starts in place of ${byId.get(action.playerId)!.lastName}.` };
    }
    case 'battingOrder': {
      const idx = lineup.findIndex((s) => s.playerId === action.playerId);
      if (idx < 0) return { ok: false, reason: "He isn't in the lineup." };
      const [slot] = lineup.splice(idx, 1);
      lineup.splice(Math.min(action.slot, lineup.length), 0, slot!);
      team.plan = { ...plan, lineup };
      return { ok: true, message: `${byId.get(action.playerId)!.lastName} now bats ${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'][Math.min(action.slot, 8)]}.` };
    }
    case 'swapCloser': {
      const next = { ...plan, setup: [...plan.setup], middle: [...plan.middle], rotation: [...plan.rotation] };
      const old = next.closer;
      for (const list of [next.setup, next.middle, next.rotation]) {
        const i = list.indexOf(action.playerId);
        if (i >= 0) {
          if (old !== null) list[i] = old;
          else list.splice(i, 1);
        }
      }
      next.closer = action.playerId;
      team.plan = next;
      return { ok: true, message: `${byId.get(action.playerId)!.lastName} is the new closer.` };
    }
    case 'toBullpen': {
      if (!plan.rotation.includes(action.playerId)) return { ok: false, reason: "He isn't in the rotation." };
      const inRotation = new Set(plan.rotation);
      const replacement = active
        .filter((p) => isPitcher(p) && !inRotation.has(p.id) && p.id !== plan.closer)
        .sort((a, b) => pitchingOverall(b.pitching!, true) - pitchingOverall(a.pitching!, true))[0];
      if (!replacement) return { ok: false, reason: 'No one available to take his spot.' };
      const rotation = plan.rotation.map((id) => (id === action.playerId ? replacement.id : id));
      const middle = [...plan.middle.filter((id) => id !== replacement.id), action.playerId];
      const setup = plan.setup.filter((id) => id !== replacement.id);
      team.plan = { ...plan, rotation, middle, setup };
      return { ok: true, message: `${byId.get(action.playerId)!.lastName} moves to the bullpen; ${replacement.lastName} joins the rotation.` };
    }
    case 'strategy':
      team.strategy = { ...(team.strategy ?? DEFAULT_STRATEGY), ...action.patch };
      return { ok: true, message: 'Team strategy updated.' };
    case 'callUp': {
      const up = byId.get(action.upId);
      const down = byId.get(action.downId);
      if (!up || !down || up.teamId !== team.id || down.teamId !== team.id || up.level !== 'AAA') return { ok: false, reason: 'That move is no longer possible.' };
      up.level = 'MLB';
      down.level = 'AAA';
      return { ok: true, message: `Called up ${up.lastName}; optioned ${down.lastName}.` };
    }
    case 'autoLineup':
      team.plan = { ...plan, lineup: autoPlan(active, useDH).lineup };
      return { ok: true, message: 'Lineup reset to the best automatic order.' };
    case 'platoon': {
      const p = byId.get(action.playerId);
      if (!p) return { ok: false, reason: 'That player is gone.' };
      const platoon = team.platoon ?? { L: [], R: [] };
      team.platoon = {
        L: platoon.L.filter((id) => id !== p.id).concat(action.hand === 'L' ? [p.id] : []),
        R: platoon.R.filter((id) => id !== p.id).concat(action.hand === 'R' ? [p.id] : []),
      };
      return { ok: true, message: `${p.lastName} will sit against ${action.hand === 'L' ? 'left' : 'right'}-handed starters.` };
    }
    case 'unplatoon': {
      const p = byId.get(action.playerId);
      if (team.platoon) team.platoon = { L: team.platoon.L.filter((id) => id !== action.playerId), R: team.platoon.R.filter((id) => id !== action.playerId) };
      return { ok: true, message: `${p?.lastName ?? 'He'} plays every day again.` };
    }
    case 'goto':
      return { ok: false, reason: 'Navigation is handled by the app.' };
  }
}
