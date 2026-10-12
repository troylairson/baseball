import { FIRST_NAMES, LAST_NAMES } from '../generate/names';
import { clampRating } from '../model/ratings';
import type { League, Team } from '../model/types';
import { Rng } from '../rng';

export type StaffRole = 'hitting' | 'pitching' | 'scouting' | 'trainer';
export const STAFF_ROLES: StaffRole[] = ['hitting', 'pitching', 'scouting', 'trainer'];
export const ROLE_LABEL: Record<StaffRole, string> = {
  hitting: 'Hitting coach',
  pitching: 'Pitching coach',
  scouting: 'Scouting director',
  trainer: 'Head trainer',
};
export const ROLE_EFFECT: Record<StaffRole, string> = {
  hitting: 'Speeds hitter development and slows decline',
  pitching: 'Speeds pitcher development and slows decline',
  scouting: 'Sharper ratings on players outside your organization',
  trainer: 'Shorter injury recoveries',
};

export interface StaffMember {
  id: number;
  name: string;
  role: StaffRole;
  /** 20–80 scale. */
  rating: number;
  age: number;
  /** Annual salary in $K. */
  salary: number;
  /** Null = available to hire. */
  teamId: number | null;
}

/** Scouting spend levels: 0 = low, 1 = standard, 2 = high. */
export const SCOUTING_LEVELS = [
  { label: 'Low', cost: 1000 },
  { label: 'Standard', cost: 3000 },
  { label: 'High', cost: 6000 },
] as const;

export function staffSalary(rating: number): number {
  return Math.round((250 + Math.max(0, rating - 35) ** 1.6 * 12) / 10) * 10;
}

function makeStaff(id: number, role: StaffRole, rng: Rng, teamId: number | null, mean = 50): StaffMember {
  const rating = clampRating(rng.normal(mean, 9));
  return {
    id,
    name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
    role,
    rating,
    age: rng.int(34, 68),
    salary: staffSalary(rating),
    teamId,
  };
}

const POOL_PER_ROLE = 5;

/** Give every team a full staff and stock the hiring pool. Idempotent. */
export function ensureStaff(league: League, teams: Team[], seed: number): void {
  if (league.staff?.length) return;
  const rng = new Rng(`${seed}-staff`);
  const staff: StaffMember[] = [];
  let id = 1;
  for (const team of teams) for (const role of STAFF_ROLES) staff.push(makeStaff(id++, role, rng, team.id));
  for (const role of STAFF_ROLES) for (let i = 0; i < POOL_PER_ROLE; i++) staff.push(makeStaff(id++, role, rng, null, 48));
  league.staff = staff;
  for (const team of teams) team.scoutingLevel ??= 1;
}

export function staffOf(league: League, teamId: number, role: StaffRole): StaffMember | undefined {
  return league.staff?.find((s) => s.teamId === teamId && s.role === role);
}

export const staffRating = (league: League, teamId: number, role: StaffRole) => staffOf(league, teamId, role)?.rating ?? 50;

/** Annual cost of staff plus scouting for a team, in $K. */
export function staffCost(league: League, team: Team): number {
  const salaries = (league.staff ?? []).filter((s) => s.teamId === team.id).reduce((sum, s) => sum + s.salary, 0);
  return salaries + SCOUTING_LEVELS[team.scoutingLevel ?? 1]!.cost;
}

/**
 * How well a team knows players: `own` for its organization, `other` for
 * everyone else (other teams, free agents, draft prospects). 1 = perfect.
 */
export function scoutingAccuracy(league: League, team: Team): { own: number; other: number } {
  const director = staffRating(league, team.id, 'scouting');
  const level = team.scoutingLevel ?? 1;
  return {
    own: Math.min(0.95, 0.8 + (director - 50) * 0.002 + level * 0.03),
    other: Math.max(0.2, Math.min(0.85, 0.42 + (director - 50) * 0.006 + level * 0.1)),
  };
}

export type HireResult = { ok: true } | { ok: false; reason: string };

/** Hire from the pool; the person being replaced joins the pool. */
export function hireStaff(league: League, teamId: number, staffId: number): HireResult {
  const hire = league.staff?.find((s) => s.id === staffId);
  if (!hire || hire.teamId !== null) return { ok: false, reason: "That person isn't available." };
  const current = staffOf(league, teamId, hire.role);
  if (current) current.teamId = null;
  hire.teamId = teamId;
  return { ok: true };
}

/** Offseason: AI teams poach clear upgrades; the pool is refreshed with new faces. */
export function staffOffseason(league: League, teams: Team[], userTeamId: number, rng: Rng): void {
  const staff = league.staff ?? [];
  for (const s of staff) s.age++;
  // Retirements from the pool and from teams.
  for (const s of staff) {
    if (s.age >= 70 && rng.chance(0.5)) s.teamId = -1;
  }
  let id = Math.max(0, ...staff.map((s) => s.id)) + 1;
  for (const team of teams) {
    for (const role of STAFF_ROLES) {
      const current = staff.find((s) => s.teamId === team.id && s.role === role);
      if (!current) {
        // Vacancy (retirement): fill from the pool or with a new hire.
        const pick = staff.filter((s) => s.teamId === null && s.role === role).sort((a, b) => b.rating - a.rating)[0];
        if (pick && team.id !== userTeamId) pick.teamId = team.id;
        else staff.push(makeStaff(id++, role, rng, team.id, 46));
        continue;
      }
      if (team.id === userTeamId) continue;
      const better = staff.filter((s) => s.teamId === null && s.role === role && s.rating >= current.rating + 6)[0];
      if (better && rng.chance(0.4)) {
        current.teamId = null;
        better.teamId = team.id;
      }
    }
  }
  league.staff = staff.filter((s) => s.teamId !== -1);
  for (const role of STAFF_ROLES) {
    const pool = league.staff.filter((s) => s.teamId === null && s.role === role);
    for (let i = pool.length; i < POOL_PER_ROLE; i++) league.staff.push(makeStaff(id++, role, rng, null, 48));
  }
}
