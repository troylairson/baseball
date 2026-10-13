import { isPitcher } from '../model/ratings';
import { addLine, avg, emptyBatting, emptyPitching, era, type BattingLine, type PitchingLine, type PlayerSeasonStats } from '../model/stats';
import type { League, Player } from '../model/types';
import { battingWar, leagueRates, pitchingWar } from '../model/war';
import { addNews } from './news';
import type { SeasonState } from './season';

export interface CareerTotals {
  seasons: number;
  bat: BattingLine;
  pit: PitchingLine;
  war: number;
  awards: string[];
  titles: number;
}

export function emptyCareer(): CareerTotals {
  return { seasons: 0, bat: emptyBatting(), pit: emptyPitching(), war: 0, awards: [], titles: 0 };
}

export interface RecordEntry {
  playerId: number;
  teamId: number;
  season: number;
  value: number;
}

export interface RecordCategory {
  key: string;
  label: string;
  /** Lower is better. */
  ascending?: boolean;
  format: (v: number) => string;
  value: (s: PlayerSeasonStats) => number;
  qualifies: (s: PlayerSeasonStats, teamGames: number) => boolean;
}

const int = (v: number) => String(Math.round(v));
export const SEASON_RECORDS: RecordCategory[] = [
  { key: 'hr', label: 'Home runs', format: int, value: (s) => s.bat.hr, qualifies: (s) => s.bat.pa > 0 },
  { key: 'rbi', label: 'RBI', format: int, value: (s) => s.bat.rbi, qualifies: (s) => s.bat.pa > 0 },
  { key: 'h', label: 'Hits', format: int, value: (s) => s.bat.h, qualifies: (s) => s.bat.pa > 0 },
  { key: 'sb', label: 'Stolen bases', format: int, value: (s) => s.bat.sb, qualifies: (s) => s.bat.pa > 0 },
  { key: 'avg', label: 'Batting average', format: (v) => v.toFixed(3).replace(/^0/, ''), value: (s) => avg(s.bat), qualifies: (s, g) => s.bat.pa >= g * 3.1 },
  { key: 'w', label: 'Wins', format: int, value: (s) => s.pit.w, qualifies: (s) => s.pit.g > 0 },
  { key: 'so', label: 'Strikeouts', format: int, value: (s) => s.pit.so, qualifies: (s) => s.pit.g > 0 },
  { key: 'sv', label: 'Saves', format: int, value: (s) => s.pit.sv, qualifies: (s) => s.pit.g > 0 },
  { key: 'era', label: 'ERA', ascending: true, format: (v) => v.toFixed(2), value: (s) => era(s.pit), qualifies: (s, g) => s.pit.outs >= g * 3 },
];

export interface HallOfFamer {
  playerId: number;
  season: number;
  votePct: number;
  summary: string;
}

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;

/** Fold the finished season into every player's career totals and WAR. */
export function addSeasonToCareers(state: SeasonState): void {
  const lines = [...state.stats.values()];
  const lg = leagueRates(lines);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  for (const s of lines) {
    const p = byId.get(s.playerId);
    if (!p) continue;
    const c = (p.career ??= emptyCareer());
    c.seasons++;
    addLine(c.bat, s.bat);
    addLine(c.pit, s.pit);
    c.war += isPitcher(p) ? pitchingWar(s.pit, lg) : battingWar(s.bat, p.position, lg);
  }
  const champ = state.league.playoffs?.championId;
  if (champ != null) {
    for (const p of state.players) if (p.teamId === champ && p.level === 'MLB' && !p.retired) (p.career ??= emptyCareer()).titles++;
  }
}

/** Check single-season records; announce new ones. */
export function updateSeasonRecords(state: SeasonState): void {
  const { league } = state;
  const records = (league.records ??= {});
  const games = league.settings.gamesPerSeason;
  const byId = new Map(state.players.map((p) => [p.id, p]));
  for (const cat of SEASON_RECORDS) {
    let best: PlayerSeasonStats | undefined;
    for (const s of state.stats.values()) {
      if (!cat.qualifies(s, games)) continue;
      const p = byId.get(s.playerId);
      if (!p || isPitcher(p) !== ['w', 'so', 'sv', 'era'].includes(cat.key)) continue;
      if (!best || (cat.ascending ? cat.value(s) < cat.value(best) : cat.value(s) > cat.value(best))) best = s;
    }
    if (!best) continue;
    const value = cat.value(best);
    const current = records[cat.key];
    const beats = !current || (cat.ascending ? value < current.value : value > current.value);
    if (!beats) continue;
    const isFirst = !current;
    records[cat.key] = { playerId: best.playerId, teamId: best.teamId, season: league.season, value };
    if (!isFirst) {
      const p = byId.get(best.playerId)!;
      addNews(league, {
        kind: 'league',
        title: `New record: ${fullName(p)}`,
        body: `${cat.format(value)} ${cat.label.toLowerCase()} breaks the single-season mark of ${cat.format(current!.value)}.`,
        playerId: p.id,
        mine: p.teamId === state.userTeamId,
      });
    }
  }
}

/** Hall of Fame worthiness from career value and honors. */
export function hallOfFameScore(p: Player): number {
  const c = p.career;
  if (!c) return 0;
  const honors = c.awards.reduce((s, a) => s + (a.includes('Valuable') || a.includes('Cy Young') ? 7 : a.includes('Rookie') ? 1 : 0), 0);
  return c.war + honors + c.titles * 1.5;
}

const ELECTION_SCORE = 65;
const BALLOT_YEARS = 10;

/** Annual vote: retired players become eligible the year after they retire. */
export function hallOfFameVote(state: SeasonState): HallOfFamer[] {
  const { league } = state;
  const hof = (league.hallOfFame ??= []);
  const inducted = new Set(hof.map((h) => h.playerId));
  const elected: HallOfFamer[] = [];
  for (const p of state.players) {
    if (!p.retired || inducted.has(p.id) || p.retiredSeason === undefined) continue;
    const yearsOnBallot = league.season - p.retiredSeason;
    if (yearsOnBallot < 1 || yearsOnBallot > BALLOT_YEARS) continue;
    const score = hallOfFameScore(p);
    const votePct = Math.max(0, Math.min(100, Math.round(40 + (score - ELECTION_SCORE) * 3 + yearsOnBallot)));
    if (votePct < 75) continue;
    const c = p.career!;
    const entry: HallOfFamer = {
      playerId: p.id,
      season: league.season,
      votePct,
      summary: `${c.seasons} seasons, ${c.war.toFixed(1)} WAR${c.awards.length ? `, ${c.awards.length} major award${c.awards.length > 1 ? 's' : ''}` : ''}`,
    };
    hof.push(entry);
    elected.push(entry);
    addNews(league, { kind: 'award', title: `${fullName(p)} elected to the Hall of Fame`, body: `${entry.summary} · ${votePct}% of the vote.`, playerId: p.id });
  }
  return elected;
}

export interface CareerCategory {
  key: string;
  label: string;
  pitching?: boolean;
  value: (c: CareerTotals) => number;
  format: (v: number) => string;
}

export const CAREER_LEADERS: CareerCategory[] = [
  { key: 'war', label: 'WAR', value: (c) => c.war, format: (v) => v.toFixed(1) },
  { key: 'hr', label: 'Home runs', value: (c) => c.bat.hr, format: int },
  { key: 'h', label: 'Hits', value: (c) => c.bat.h, format: int },
  { key: 'rbi', label: 'RBI', value: (c) => c.bat.rbi, format: int },
  { key: 'w', label: 'Wins', pitching: true, value: (c) => c.pit.w, format: int },
  { key: 'so', label: 'Strikeouts', pitching: true, value: (c) => c.pit.so, format: int },
  { key: 'sv', label: 'Saves', pitching: true, value: (c) => c.pit.sv, format: int },
];

export function careerLeaders(players: Player[], cat: CareerCategory, n = 10): Player[] {
  return players
    .filter((p) => p.career && (cat.key === 'war' || isPitcher(p) === !!cat.pitching))
    .sort((a, b) => cat.value(b.career!) - cat.value(a.career!))
    .slice(0, n);
}

export function hallOfFamers(league: League): HallOfFamer[] {
  return league.hallOfFame ?? [];
}
