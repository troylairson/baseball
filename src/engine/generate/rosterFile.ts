import { clampRating, isPitcher } from '../model/ratings';
import type {
  BattingRatings, Conference, Division, FieldPosition, League, LeagueSettings, PitchingRatings, Player, Position, Team,
} from '../model/types';
import { FIELD_POSITIONS } from '../model/types';
import { Rng } from '../rng';
import { contractDemand, initialContract, MIN_SALARY } from '../season/contracts';
import { fixRoster } from '../season/roster';
import { softenDemands, topUpFreeAgents } from './freeAgents';
import { DEFAULT_SETTINGS, START_SEASON, type GeneratedLeague } from './league';
import { generatePlayer } from './players';

/**
 * A league's teams and players as a portable file: export one from a career,
 * edit it, share it, or start a new league from it. The bundled MLB rosters
 * are converted into this format too.
 */
export interface RosterFile {
  format: 'diamond-gm-roster';
  version: 1;
  name: string;
  /** Season the rosters represent; the new league starts the season after. */
  season: number;
  conferences: { name: string; abbr: string }[];
  /** `conference` indexes into conferences. */
  divisions: { name: string; conference: number }[];
  teams: RosterTeam[];
  players: RosterPlayer[];
}

export interface RosterTeam {
  /** Stable key players use to point at their team (usually the abbreviation). */
  key: string;
  city: string;
  name: string;
  abbr: string;
  primaryColor: string;
  secondaryColor: string;
  /** 1 (small) – 5 (large). */
  market: number;
  /** Index into divisions. */
  division: number;
}

export interface RosterPlayer {
  firstName: string;
  lastName: string;
  age: number;
  bats: Player['bats'];
  throws: Player['throws'];
  position: Position;
  /** Team key, or null for a free agent. */
  team: string | null;
  level?: Player['level'];
  positionRatings?: Player['positionRatings'];
  batting: BattingRatings;
  battingPotential?: BattingRatings;
  fielding: Player['fielding'];
  pitching?: PitchingRatings | null;
  pitchingPotential?: PitchingRatings | null;
  personality?: Player['personality'];
  injuryProneness?: number;
  contract?: Player['contract'];
  experience?: number;
}

/** Org minimums so every club can field a legal roster and absorb injuries. */
const ORG_MINIMUMS: [Position, (p: Player) => boolean, number][] = [
  ['SP', (p) => p.position === 'SP', 7],
  ['C', (p) => p.position === 'C', 3],
  ['RP', isPitcher, 18],
  ['SS', (p) => !isPitcher(p), 17],
];

// ---------------------------------------------------------------------------
// Export

export function exportRoster(source: { league: League; teams: Team[]; players: Player[] }, name?: string): RosterFile {
  const { league, teams } = source;
  const key = new Map(teams.map((t) => [t.id, t.abbr]));
  const divisionIndex = new Map(league.divisions.map((d, i) => [d.id, i]));
  const conferenceIndex = new Map(league.conferences.map((c, i) => [c.id, i]));
  return {
    format: 'diamond-gm-roster',
    version: 1,
    name: name ?? league.settings.name,
    season: league.season,
    conferences: league.conferences.map((c) => ({ name: c.name, abbr: c.abbr })),
    divisions: league.divisions.map((d) => ({ name: d.name, conference: conferenceIndex.get(d.conferenceId) ?? 0 })),
    teams: teams.map((t) => ({
      key: t.abbr, city: t.city, name: t.name, abbr: t.abbr, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor,
      market: t.market, division: divisionIndex.get(t.divisionId) ?? 0,
    })),
    players: source.players
      .filter((p) => !p.retired && !p.draftProspect)
      .map((p) => ({
        firstName: p.firstName, lastName: p.lastName, age: p.age, bats: p.bats, throws: p.throws, position: p.position,
        team: p.teamId === null ? null : key.get(p.teamId) ?? null, level: p.level,
        positionRatings: p.positionRatings, batting: p.batting, battingPotential: p.battingPotential, fielding: p.fielding,
        pitching: p.pitching, pitchingPotential: p.pitchingPotential, personality: p.personality,
        injuryProneness: p.injuryProneness, contract: p.contract, experience: p.experience,
      })),
  };
}

// ---------------------------------------------------------------------------
// Validation

const POSITIONS = new Set<string>([...FIELD_POSITIONS, 'DH', 'SP', 'RP']);

/** Check an untrusted file and return it typed, or throw a readable error. */
export function parseRosterFile(data: unknown): RosterFile {
  const fail = (msg: string): never => { throw new Error(`Not a valid roster file: ${msg}.`); };
  if (!data || typeof data !== 'object') fail('expected a JSON object');
  const f = data as Partial<RosterFile>;
  if (f.format !== 'diamond-gm-roster') fail('missing "format": "diamond-gm-roster"');
  if (!Array.isArray(f.teams) || f.teams.length < 4) fail('it needs at least 4 teams');
  if (f.teams!.length > 40) fail('it has more than 40 teams');
  if (!Array.isArray(f.players)) fail('missing players');
  if (!Array.isArray(f.conferences) || !f.conferences.length) fail('missing conferences');
  if (!Array.isArray(f.divisions) || !f.divisions.length) fail('missing divisions');
  const keys = new Set<string>();
  for (const t of f.teams!) {
    if (!t || typeof t.key !== 'string' || typeof t.city !== 'string' || typeof t.name !== 'string') fail('every team needs key, city and name');
    if (keys.has(t.key)) fail(`duplicate team key "${t.key}"`);
    keys.add(t.key);
    if (!Number.isInteger(t.division) || !f.divisions![t.division]) fail(`team ${t.key} has an unknown division`);
  }
  for (const d of f.divisions!) if (!f.conferences![d.conference]) fail(`division ${d.name} has an unknown conference`);
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  f.players!.forEach((p, i) => {
    const who = `player ${i + 1}`;
    if (!p || typeof p.firstName !== 'string' || typeof p.lastName !== 'string') fail(`${who} needs a firstName and lastName`);
    if (!POSITIONS.has(p.position)) fail(`${who} has an unknown position "${String(p.position)}"`);
    if (!num(p.age)) fail(`${who} needs an age`);
    if (p.team !== null && !keys.has(p.team)) fail(`${who} plays for unknown team "${String(p.team)}"`);
    if (!p.batting || !['contact', 'power', 'eye', 'speed'].every((k) => num((p.batting as unknown as Record<string, unknown>)[k]))) fail(`${who} needs batting ratings`);
    if (!p.fielding || !num(p.fielding.defense) || !num(p.fielding.arm)) fail(`${who} needs fielding ratings`);
    if ((p.position === 'SP' || p.position === 'RP')
      && (!p.pitching || !['stuff', 'control', 'movement', 'stamina'].every((k) => num((p.pitching as unknown as Record<string, unknown>)[k])))) {
      fail(`${who} is a pitcher without pitching ratings`);
    }
  });
  return f as RosterFile;
}

// ---------------------------------------------------------------------------
// Build a league

const clampBat = (b: BattingRatings): BattingRatings => ({
  contact: clampRating(b.contact), power: clampRating(b.power), eye: clampRating(b.eye), speed: clampRating(b.speed),
});
const clampPitch = (p: PitchingRatings): PitchingRatings => ({
  stuff: clampRating(p.stuff), control: clampRating(p.control), movement: clampRating(p.movement), stamina: clampRating(p.stamina),
});

/** Turn a roster file into a fresh league ready to play. */
export function leagueFromRoster(
  file: RosterFile,
  seed: number | string,
  opts: Partial<Pick<LeagueSettings, 'gamesPerSeason' | 'designatedHitter' | 'difficulty'>> = {},
): GeneratedLeague {
  const rng = new Rng(seed);
  const conferences: Conference[] = file.conferences.map((c, i) => ({ id: i, name: c.name, abbr: c.abbr }));
  const divisions: Division[] = file.divisions.map((d, i) => ({ id: i, conferenceId: d.conference, name: d.name }));
  const teams: Team[] = file.teams.map((t, id) => ({
    id,
    city: t.city,
    name: t.name,
    abbr: (t.abbr || t.key).slice(0, 4).toUpperCase(),
    primaryColor: t.primaryColor || '#334155',
    secondaryColor: t.secondaryColor || '#94a3b8',
    conferenceId: divisions[t.division]!.conferenceId,
    divisionId: t.division,
    market: Math.max(1, Math.min(5, Math.round(t.market || 3))),
    wins: 0, losses: 0, runsScored: 0, runsAllowed: 0, rotationSlot: 0,
  }));
  const teamByKey = new Map(file.teams.map((t, i) => [t.key, teams[i]!]));
  const perConference = Math.max(...conferences.map((c) => divisions.filter((d) => d.conferenceId === c.id).length));
  const settings: LeagueSettings = {
    ...DEFAULT_SETTINGS,
    name: file.name || DEFAULT_SETTINGS.name,
    teamCount: teams.length,
    conferences: conferences.length,
    divisionsPerConference: perConference,
    gamesPerSeason: opts.gamesPerSeason ?? DEFAULT_SETTINGS.gamesPerSeason,
    designatedHitter: opts.designatedHitter ?? DEFAULT_SETTINGS.designatedHitter,
    difficulty: opts.difficulty ?? 1,
  };

  const players: Player[] = file.players.map((r, i) => {
    const pitcher = r.position === 'SP' || r.position === 'RP';
    const batting = clampBat(r.batting);
    const pitching = pitcher ? clampPitch(r.pitching!) : null;
    const team = r.team === null ? null : teamByKey.get(r.team)!;
    const p: Player = {
      id: i + 1,
      firstName: r.firstName,
      lastName: r.lastName,
      age: Math.round(r.age),
      bats: r.bats === 'L' || r.bats === 'S' ? r.bats : 'R',
      throws: r.throws === 'L' ? 'L' : 'R',
      position: r.position,
      positionRatings: Object.fromEntries(
        Object.entries(r.positionRatings ?? {}).filter(([k, v]) => FIELD_POSITIONS.includes(k as FieldPosition) && typeof v === 'number').map(([k, v]) => [k, clampRating(v!)]),
      ),
      batting,
      battingPotential: r.battingPotential ? clampBat(r.battingPotential) : { ...batting },
      fielding: { defense: clampRating(r.fielding.defense), arm: clampRating(r.fielding.arm) },
      pitching,
      pitchingPotential: pitching ? (r.pitchingPotential ? clampPitch(r.pitchingPotential) : { ...pitching }) : null,
      personality: r.personality ?? {
        workEthic: clampRating(rng.normal(50, 10)), leadership: clampRating(rng.normal(50 + Math.max(0, r.age - 28), 10)),
        loyalty: clampRating(rng.normal(50, 10)), greed: clampRating(rng.normal(50, 10)),
      },
      injuryProneness: r.injuryProneness ?? Math.min(1, Math.max(0, rng.normal(0.3, 0.12))),
      teamId: team ? team.id : null,
      level: team ? (r.level === 'AAA' ? 'AAA' : 'MLB') : 'MLB',
      contract: null,
      scoutSeed: rng.nextUint32(),
      fatigue: 0,
      experience: r.experience ?? (r.level === 'AAA' ? 0 : Math.max(0, Math.round(r.age) - 24)),
    };
    if (!pitcher && p.position !== 'DH' && p.positionRatings[p.position as FieldPosition] === undefined) {
      p.positionRatings[p.position as FieldPosition] = p.fielding.defense;
    }
    if (team) {
      p.contract = r.contract && r.contract.salary > 0
        ? { salary: Math.max(MIN_SALARY, Math.round(r.contract.salary)), years: Math.max(1, Math.round(r.contract.years)) }
        : initialContract(p, rng);
    } else {
      p.demand = contractDemand(p);
    }
    return p;
  });

  // Every club needs enough bodies to field a legal roster; pad with depth.
  const usedNames = new Set(players.map((p) => `${p.firstName[0]}. ${p.lastName}`));
  for (const team of teams) {
    const teamRng = rng.fork(`depth-${team.id}`);
    for (const [position, match, min] of ORG_MINIMUMS) {
      while (players.filter((p) => p.teamId === team.id && match(p)).length < min) {
        const id = players.reduce((m, p) => Math.max(m, p.id), 0) + 1;
        const p = generatePlayer(
          { id, position, talent: teamRng.normal(41, 3), age: teamRng.int(23, 30), teamId: team.id, level: 'AAA' },
          teamRng,
          usedNames,
        );
        p.contract = { salary: MIN_SALARY, years: 1 };
        p.experience = 0;
        players.push(p);
      }
    }
    const org = players.filter((p) => p.teamId === team.id);
    // Too many listed as major leaguers: let the roster logic pick the best 26.
    if (org.filter((p) => p.level === 'MLB').length > 26) for (const p of org) p.level = 'AAA';
    fixRoster(org, true);
  }

  topUpFreeAgents(players, teams.length, rng.fork('free-agents'));
  softenDemands(players);
  for (const team of teams) {
    const payroll = players.filter((p) => p.teamId === team.id).reduce((s, p) => s + (p.contract?.salary ?? 0), 0);
    team.budget = Math.max(70000 + team.market * 22000, Math.round((payroll * 1.08 + 8000) / 1000) * 1000);
  }

  const season = Number.isInteger(file.season) ? file.season + 1 : START_SEASON;
  return {
    league: { settings, conferences, divisions, season, phase: 'preseason', date: `${season}-03-01` },
    teams,
    players,
  };
}
