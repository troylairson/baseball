import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { developPlayer } from '../progression';
import { Rng } from '../rng';
import { ensureStaff, hireStaff, scoutingAccuracy, staffCost, staffOf, staffOffseason, STAFF_ROLES } from './staff';

describe('staff', () => {
  const { league, teams } = generateLeague(12);
  ensureStaff(league, teams, 12);

  it('gives every team one of each role and stocks a pool', () => {
    for (const t of teams) for (const role of STAFF_ROLES) expect(staffOf(league, t.id, role)).toBeDefined();
    expect(league.staff!.filter((s) => s.teamId === null).length).toBe(STAFF_ROLES.length * 5);
  });

  it('hiring swaps the incumbent into the pool', () => {
    const candidate = league.staff!.find((s) => s.teamId === null && s.role === 'scouting')!;
    const incumbent = staffOf(league, 0, 'scouting')!;
    expect(hireStaff(league, 0, candidate.id).ok).toBe(true);
    expect(staffOf(league, 0, 'scouting')!.id).toBe(candidate.id);
    expect(incumbent.teamId).toBeNull();
  });

  it('better scouting and bigger budgets mean better information, at a cost', () => {
    const team = teams[0]!;
    team.scoutingLevel = 0;
    const low = scoutingAccuracy(league, team);
    const lowCost = staffCost(league, team);
    team.scoutingLevel = 2;
    const high = scoutingAccuracy(league, team);
    expect(high.other).toBeGreaterThan(low.other);
    expect(staffCost(league, team)).toBeGreaterThan(lowCost);
    expect(high.own).toBeGreaterThan(high.other);
  });

  it('keeps every team staffed through offseasons', () => {
    for (let i = 0; i < 5; i++) staffOffseason(league, teams, 0, new Rng(i));
    for (const t of teams) for (const role of STAFF_ROLES) expect(staffOf(league, t.id, role)).toBeDefined();
  });

  it('good coaches develop prospects faster', () => {
    const { players } = generateLeague(13);
    const prospects = players.filter((p) => p.age <= 21 && !p.pitching);
    const growth = (coach: number) => {
      let total = 0;
      for (const p of prospects) {
        const copy = structuredClone(p);
        developPlayer(copy, new Rng(p.id), { hitting: coach, pitching: 50 });
        total += copy.batting.contact - p.batting.contact;
      }
      return total;
    };
    expect(growth(75)).toBeGreaterThan(growth(30));
  });
});
