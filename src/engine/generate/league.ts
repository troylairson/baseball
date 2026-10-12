import { overall } from '../model/ratings';
import type { Conference, Division, League, LeagueSettings, Player, Position, Team } from '../model/types';
import { Rng } from '../rng';
import { FRANCHISES, TEAM_COLORS } from './names';
import { estimateSalary, generatePlayer } from './players';

export const DEFAULT_SETTINGS: LeagueSettings = {
  name: 'Diamond League',
  teamCount: 20,
  conferences: 2,
  divisionsPerConference: 2,
  gamesPerSeason: 162,
  designatedHitter: true,
};

export const START_SEASON = 2027;

export interface GeneratedLeague {
  league: League;
  teams: Team[];
  players: Player[];
}

/**
 * 26-man active roster template: 9 starting hitters, 4 bench, 5 starters,
 * 3 late-inning relievers, 5 middle relievers.
 */
const MLB_ROSTER: Position[] = [
  'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH',
  'C', 'SS', '2B', 'CF',
  'SP', 'SP', 'SP', 'SP', 'SP',
  'RP', 'RP', 'RP', 'RP', 'RP', 'RP', 'RP', 'RP',
];

/** AAA affiliate: depth plus prospects. */
const AAA_ROSTER: Position[] = [
  'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF',
  'SP', 'SP', 'SP', 'SP', 'RP', 'RP', 'RP', 'RP',
];

function mlbTalent(index: number, teamOffset: number, rng: Rng): number {
  const isBench = index >= 9 && index <= 12;
  const isLateRelief = index >= 18 && index <= 20;
  const isMiddleRelief = index >= 21;
  const base = isBench ? 45 : isMiddleRelief ? 46 : isLateRelief ? 51 : 53;
  // MLB players are a selected population: keep a floor so nobody is unplayable.
  return Math.max(40, base + teamOffset + rng.normal(0, 4.5));
}

function divisionNames(count: number): string[] {
  if (count === 1) return [''];
  if (count === 2) return ['East', 'West'];
  if (count === 3) return ['East', 'Central', 'West'];
  return Array.from({ length: count }, (_, i) => `Division ${i + 1}`);
}

export function generateLeague(seed: number | string, settings: LeagueSettings = DEFAULT_SETTINGS): GeneratedLeague {
  const rng = new Rng(seed);
  const confNames = [['Atlantic Conference', 'ATL'], ['Pacific Conference', 'PAC']] as const;

  const conferences: Conference[] = Array.from({ length: settings.conferences }, (_, i) => ({
    id: i,
    name: confNames[i]?.[0] ?? `Conference ${i + 1}`,
    abbr: confNames[i]?.[1] ?? `C${i + 1}`,
  }));
  const divisions: Division[] = conferences.flatMap((conf) =>
    divisionNames(settings.divisionsPerConference).map((name, i) => ({
      id: conf.id * settings.divisionsPerConference + i,
      conferenceId: conf.id,
      name: name ? `${conf.abbr} ${name}` : conf.name,
    })),
  );

  const franchises = rng.shuffle([...FRANCHISES]).slice(0, settings.teamCount);
  const colors = rng.shuffle([...TEAM_COLORS]);
  const teams: Team[] = franchises.map(([city, name], id) => {
    const division = divisions[id % divisions.length]!;
    return {
      id,
      city,
      name,
      abbr: abbreviate(city),
      primaryColor: colors[id % colors.length]![0],
      secondaryColor: colors[id % colors.length]![1],
      conferenceId: division.conferenceId,
      divisionId: division.id,
      market: rng.int(1, 5),
      wins: 0,
      losses: 0,
      runsScored: 0,
      runsAllowed: 0,
      rotationSlot: 0,
    };
  });
  dedupeAbbreviations(teams);

  const players: Player[] = [];
  const usedNames = new Set<string>();
  let nextId = 1;
  for (const team of teams) {
    const teamRng = rng.fork(`team-${team.id}`);
    const teamOffset = teamRng.normal(0, 1);
    MLB_ROSTER.forEach((position, i) => {
      const age = Math.round(Math.min(38, Math.max(22, teamRng.normal(28.5, 3.5))));
      players.push(generatePlayer(
        { id: nextId++, position, talent: mlbTalent(i, teamOffset, teamRng), age, teamId: team.id, level: 'MLB' },
        teamRng,
        usedNames,
      ));
    });
    AAA_ROSTER.forEach((position) => {
      const prospect = teamRng.chance(0.4);
      const age = prospect ? teamRng.int(19, 23) : teamRng.int(24, 31);
      const talent = prospect ? teamRng.normal(38, 5) : teamRng.normal(42, 4);
      players.push(generatePlayer(
        { id: nextId++, position, talent, age, teamId: team.id, level: 'AAA' },
        teamRng,
        usedNames,
      ));
    });
  }

  for (const player of players) {
    const ovr = overall(player);
    player.contract = {
      salary: estimateSalary(ovr, player.age, rng),
      years: player.age < 26 ? rng.int(1, 3) : rng.int(1, Math.max(1, Math.min(6, 36 - player.age))),
    };
  }
  // Owners fund at least the payroll they inherit, plus a little room.
  for (const team of teams) {
    const payroll = players.filter((p) => p.teamId === team.id).reduce((s, p) => s + p.contract!.salary, 0);
    team.budget = Math.max(70000 + team.market * 22000, Math.round((payroll * 1.08 + 8000) / 1000) * 1000);
  }

  return {
    league: {
      settings,
      conferences,
      divisions,
      season: START_SEASON,
      phase: 'preseason',
      date: `${START_SEASON}-03-01`,
    },
    teams,
    players,
  };
}

/** "Las Vegas" -> "LV", "Portland" -> "POR". */
function abbreviate(city: string): string {
  const words = city.split(' ');
  return (words.length > 1 ? words.map((w) => w[0]).join('') : city.slice(0, 3)).toUpperCase();
}

function dedupeAbbreviations(teams: Team[]): void {
  const seen = new Set<string>();
  for (const team of teams) {
    const letters = team.name.replace(/[^A-Za-z]/g, '');
    let abbr = team.abbr;
    for (let i = 0; seen.has(abbr); i++) {
      abbr = (team.abbr.slice(0, 2) + (letters[i] ?? String(team.id))).toUpperCase();
    }
    seen.add(abbr);
    team.abbr = abbr;
  }
}
