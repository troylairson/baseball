import type { League, PlayoffSeries, PlayoffState, ScheduledGame, Team } from '../model/types';

/** Teams per conference that make the playoffs (power of two). */
export const PLAYOFF_TEAMS_PER_CONFERENCE = 4;

const runDiff = (t: Team) => t.runsScored - t.runsAllowed;
const byRecord = (a: Team, b: Team) => b.wins - a.wins || runDiff(b) - runDiff(a) || a.id - b.id;

/**
 * Seed a conference: division winners first (by record), then wild cards.
 */
export function seedConference(league: League, teams: Team[], conferenceId: number, slots: number): Team[] {
  const conf = teams.filter((t) => t.conferenceId === conferenceId);
  const divisions = league.divisions.filter((d) => d.conferenceId === conferenceId);
  const winners = divisions
    .map((d) => conf.filter((t) => t.divisionId === d.id).sort(byRecord)[0])
    .filter((t): t is Team => !!t)
    .sort(byRecord)
    .slice(0, slots);
  const wildCards = conf.filter((t) => !winners.includes(t)).sort(byRecord).slice(0, slots - winners.length);
  return [...winners, ...wildCards];
}

/** Playoff berths per conference for this league's size. */
export function playoffSlots(league: League, teams: Team[]): number {
  const confs = league.conferences.length >= 2 ? league.conferences.slice(0, 2) : league.conferences;
  const perConf = Math.min(PLAYOFF_TEAMS_PER_CONFERENCE, ...confs.map((c) => teams.filter((t) => t.conferenceId === c.id).length));
  return perConf >= 4 ? 4 : 2;
}

export interface RaceRow {
  team: Team;
  /** Playoff seed if the season ended today. */
  seed: number | null;
  status: 'division' | 'wildcard' | 'out';
  /**
   * For wild-card holders: games ahead of the first team out.
   * For teams outside: games behind the last playoff spot.
   * For division leaders: games ahead of their division's runner-up.
   */
  games: number;
  divisionName: string;
}

export interface ConferenceRace {
  conferenceId: number;
  name: string;
  rows: RaceRow[];
}

const gamesApart = (a: Team, b: Team) => (a.wins - b.wins + (b.losses - a.losses)) / 2;

/** If the season ended today: division leaders, wild cards and the chase. */
export function playoffPicture(league: League, teams: Team[]): ConferenceRace[] {
  const slots = playoffSlots(league, teams);
  const confs = league.conferences.length >= 2 ? league.conferences.slice(0, 2) : league.conferences;
  return confs.map((conf) => {
    const divisions = league.divisions.filter((d) => d.conferenceId === conf.id);
    const divName = (t: Team) => divisions.find((d) => d.id === t.divisionId)?.name ?? '';
    const seeds = seedConference(league, teams, conf.id, slots);
    const leaders = new Set(divisions.map((d) => teams.filter((t) => t.divisionId === d.id).sort(byRecord)[0]?.id));
    const others = teams.filter((t) => t.conferenceId === conf.id && !seeds.includes(t)).sort(byRecord);
    const firstOut = others[0];
    const lastIn = seeds[seeds.length - 1]!;
    const rows: RaceRow[] = seeds.map((t, i) => {
      const division = leaders.has(t.id);
      const runnerUp = teams.filter((x) => x.divisionId === t.divisionId && x.id !== t.id).sort(byRecord)[0];
      return {
        team: t,
        seed: i + 1,
        status: division ? 'division' : 'wildcard',
        games: division ? (runnerUp ? gamesApart(t, runnerUp) : 0) : firstOut ? gamesApart(t, firstOut) : 0,
        divisionName: divName(t),
      };
    });
    for (const t of others) rows.push({ team: t, seed: null, status: 'out', games: gamesApart(lastIn, t), divisionName: divName(t) });
    return { conferenceId: conf.id, name: conf.name, rows };
  });
}

/** Build the bracket: per-conference rounds, then a final between conference champions. */
export function createPlayoffs(league: League, teams: Team[]): PlayoffState {
  const series: PlayoffSeries[] = [];
  let id = 1;
  const bestOfFor = (round: number) => (round === 1 ? 5 : 7);
  const confs = league.conferences.length >= 2 ? league.conferences.slice(0, 2) : league.conferences;
  const size = playoffSlots(league, teams);
  const champs: number[] = [];

  for (const conf of confs) {
    const seeds = seedConference(league, teams, conf.id, size);
    if (size === 4) {
      const pairs: [number, number][] = [[0, 3], [1, 2]];
      const firstRound = pairs.map(([h, l]) => {
        const s: PlayoffSeries = {
          id: id++, round: 1, conferenceId: conf.id, bestOf: bestOfFor(1),
          highId: seeds[h]!.id, lowId: seeds[l]!.id, highSeed: h + 1, lowSeed: l + 1,
          highWins: 0, lowWins: 0, winnerId: null, feeders: [],
        };
        series.push(s);
        return s.id;
      });
      const confFinal: PlayoffSeries = {
        id: id++, round: 2, conferenceId: conf.id, bestOf: bestOfFor(2),
        highId: null, lowId: null, highSeed: 0, lowSeed: 0, highWins: 0, lowWins: 0, winnerId: null, feeders: firstRound,
      };
      series.push(confFinal);
      champs.push(confFinal.id);
    } else {
      const s: PlayoffSeries = {
        id: id++, round: 1, conferenceId: conf.id, bestOf: 7,
        highId: seeds[0]!.id, lowId: seeds[1]!.id, highSeed: 1, lowSeed: 2,
        highWins: 0, lowWins: 0, winnerId: null, feeders: [],
      };
      series.push(s);
      champs.push(s.id);
    }
  }

  if (champs.length === 2) {
    const round = Math.max(...series.map((s) => s.round)) + 1;
    series.push({
      id: id++, round, conferenceId: null, bestOf: 7,
      highId: null, lowId: null, highSeed: 0, lowSeed: 0, highWins: 0, lowWins: 0, winnerId: null, feeders: champs,
    });
  }
  return { series, championId: null };
}

export function finalSeries(playoffs: PlayoffState): PlayoffSeries {
  return playoffs.series.reduce((a, b) => (b.round > a.round ? b : a));
}

/** Fill later-round matchups once both feeder series are decided. */
export function advanceBracket(playoffs: PlayoffState, teams: Team[]): void {
  const byId = new Map(teams.map((t) => [t.id, t]));
  for (const s of playoffs.series) {
    if (s.highId !== null || s.feeders.length === 0) continue;
    const winners = s.feeders.map((f) => playoffs.series.find((x) => x.id === f)?.winnerId ?? null);
    if (winners.some((w) => w === null)) continue;
    const [a, b] = (winners as number[]).map((w) => byId.get(w)!).sort(byRecord);
    s.highId = a!.id;
    s.lowId = b!.id;
    s.highSeed = 1;
    s.lowSeed = 2;
  }
  const final = finalSeries(playoffs);
  playoffs.championId = final.winnerId;
}

/** Series that still need games and have both teams. */
export function activeSeries(playoffs: PlayoffState): PlayoffSeries[] {
  return playoffs.series.filter((s) => s.winnerId === null && s.highId !== null && s.lowId !== null);
}

/** 2-2-1 for best-of-5, 2-3-2 for best-of-7: is game n hosted by the higher seed? */
export function highSeedHosts(bestOf: number, gameNumber: number): boolean {
  return bestOf === 5 ? [1, 2, 5].includes(gameNumber) : [1, 2, 6, 7].includes(gameNumber);
}

export function nextSeriesGame(s: PlayoffSeries, id: number, date: string): ScheduledGame {
  const n = s.highWins + s.lowWins + 1;
  const highHome = highSeedHosts(s.bestOf, n);
  return {
    id,
    seriesId: s.id,
    date,
    homeId: highHome ? s.highId! : s.lowId!,
    awayId: highHome ? s.lowId! : s.highId!,
    played: false,
    homeScore: null,
    awayScore: null,
    innings: null,
  };
}

export function recordSeriesGame(s: PlayoffSeries, winnerId: number): void {
  if (winnerId === s.highId) s.highWins++;
  else s.lowWins++;
  const need = Math.ceil(s.bestOf / 2);
  if (s.highWins >= need) s.winnerId = s.highId;
  if (s.lowWins >= need) s.winnerId = s.lowId;
}

export function roundName(s: PlayoffSeries): string {
  if (s.conferenceId === null) return 'Diamond Series';
  if (s.feeders.length > 0 || s.bestOf === 7) return 'Conference Series';
  return 'Division Series';
}
