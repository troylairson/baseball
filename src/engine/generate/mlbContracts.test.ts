import { describe, expect, it } from 'vitest';
import { generateLeague } from './league';
import { contractStatus, headedToFreeAgency, yearsOfControl } from '../season/contracts';
import { KNOWN_CONTRACTS, knownContract } from './mlbContracts';

describe('known MLB contracts', () => {
  it('turns a deal into salary and seasons left', () => {
    expect(knownContract('Juan', 'Soto', 2026)).toEqual({ salary: 51000, years: 14 });
    expect(knownContract('Aaron', 'Judge', 2026)).toEqual({ salary: 40000, years: 6 });
    // Deferred deal: present value, not the face amount.
    expect(knownContract('Shohei', 'Ohtani', 2026)!.salary).toBe(46100);
  });

  it('matches names loosely and ignores deals that are over or not started', () => {
    expect(knownContract('Ronald', 'Acuna Jr.', 2026)).toEqual({ salary: 12500, years: 1 });
    expect(knownContract('Ronald', 'Acuña', 2027)).toBeNull();
    expect(knownContract('Kyle', 'Tucker', 2025)).toBeNull();
    expect(knownContract('Nobody', 'Here', 2026)).toBeNull();
  });

  it('has sane rows', () => {
    for (const c of KNOWN_CONTRACTS) {
      expect(c.through).toBeGreaterThanOrEqual(c.from);
      expect(c.total / (c.through - c.from + 1)).toBeGreaterThan(5);
    }
  });
});

describe('estimated contracts', () => {
  const { players } = generateLeague(12);
  const mlb = players.filter((p) => p.teamId !== null && p.level === 'MLB');

  it('puts veterans partway through multi-year deals', () => {
    const vets = mlb.filter((p) => contractStatus(p) === 'free-agent');
    const multi = vets.filter((p) => p.contract!.years > 1).length / vets.length;
    expect(multi).toBeGreaterThan(0.3);
    expect(Math.max(...vets.map((p) => p.contract!.years))).toBeGreaterThanOrEqual(5);
  });

  it('keeps young players under team control rather than expiring', () => {
    const young = mlb.filter((p) => contractStatus(p) === 'pre-arb');
    expect(young.every((p) => yearsOfControl(p) >= 4)).toBe(true);
    expect(young.some(headedToFreeAgency)).toBe(false);
  });
});
