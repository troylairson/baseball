import { describe, expect, it } from 'vitest';
import { overall } from '../model/ratings';
import { generateLeague } from './league';
import { mlbPackToRoster, type MlbPack } from './mlb';
import { exportRoster, leagueFromRoster, parseRosterFile } from './rosterFile';
import packText from '../../../public/data/mlb.json?raw';

const legalRosters = (players: ReturnType<typeof generateLeague>['players'], teamIds: number[]) => {
  for (const id of teamIds) {
    const active = players.filter((p) => p.teamId === id && p.level === 'MLB');
    expect(active).toHaveLength(26);
    expect(active.filter((p) => p.position === 'SP').length).toBeGreaterThanOrEqual(5);
    expect(active.filter((p) => p.position === 'C').length).toBeGreaterThanOrEqual(2);
  }
};

describe('roster files', () => {
  it('round-trips a league through export and import', () => {
    const src = generateLeague(3);
    const file = parseRosterFile(JSON.parse(JSON.stringify(exportRoster(src))));
    const { league, teams, players } = leagueFromRoster(file, 9);
    expect(teams.map((t) => t.city)).toEqual(src.teams.map((t) => t.city));
    expect(league.divisions).toHaveLength(src.league.divisions.length);
    expect(league.season).toBe(src.league.season + 1);
    const rostered = (ps: typeof players) => ps.filter((p) => p.teamId !== null).map((p) => `${p.firstName} ${p.lastName} ${overall(p)}`).sort();
    expect(rostered(players)).toEqual(rostered(src.players));
    legalRosters(players, teams.map((t) => t.id));
    expect(new Set(players.map((p) => p.id)).size).toBe(players.length);
  });

  it('rejects malformed files with a readable reason', () => {
    expect(() => parseRosterFile({})).toThrow(/format/);
    const file = exportRoster(generateLeague(4));
    file.players[0]!.team = 'NOPE';
    expect(() => parseRosterFile(file)).toThrow(/unknown team "NOPE"/);
  });

  it('pads thin organizations with depth', () => {
    const file = exportRoster(generateLeague(5));
    const key = file.teams[0]!.key;
    file.players = file.players.filter((p) => p.team !== key || p.position === 'SS');
    const { players, teams } = leagueFromRoster(parseRosterFile(file), 1);
    legalRosters(players, [teams[0]!.id]);
  });
});

describe('MLB rosters', () => {
  const pack = JSON.parse(packText) as MlbPack;
  const file = mlbPackToRoster(pack);
  const { teams, players } = leagueFromRoster(parseRosterFile(file), 1);

  it('builds all 30 clubs in two leagues of three divisions', () => {
    expect(teams).toHaveLength(30);
    expect(file.conferences.map((c) => c.abbr)).toEqual(['AL', 'NL']);
    expect(file.divisions).toHaveLength(6);
    legalRosters(players, teams.map((t) => t.id));
  });

  it('centers ratings near the game scale and rates stars as stars', () => {
    const mlb = players.filter((p) => p.teamId !== null && p.level === 'MLB');
    const mean = mlb.reduce((s, p) => s + overall(p), 0) / mlb.length;
    expect(mean).toBeGreaterThan(47);
    expect(mean).toBeLessThan(55);
    const best = [...mlb].sort((a, b) => overall(b) - overall(a)).slice(0, 40);
    expect(best.every((p) => overall(p) >= 56)).toBe(true);
  });
});
