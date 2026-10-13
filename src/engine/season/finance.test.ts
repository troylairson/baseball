import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { emptyFinances, expectedFill, fanInterestTarget, nextBudget, recordHomeGate, totalRevenue } from './finance';

describe('finances', () => {
  const { teams, players } = generateLeague(61);
  const team = teams[0]!;

  it('trades attendance against price', () => {
    team.fanInterest = 60;
    team.ticketPrice = 0;
    const cheapFill = expectedFill(team);
    team.ticketPrice = 4;
    expect(expectedFill(team)).toBeLessThan(cheapFill);
  });

  it('books gate revenue and grows budgets for clubs that earn more', () => {
    team.ticketPrice = 2;
    team.finances = emptyFinances(2027);
    for (let i = 0; i < 81; i++) recordHomeGate(team, 2027, false);
    expect(team.finances.homeGames).toBe(81);
    expect(team.finances.tickets).toBeGreaterThan(40000);
    team.budget = 120000;
    team.lastFinances = { ...team.finances, media: 60000, merch: 15000 };
    const rich = nextBudget(team);
    team.lastFinances = { ...team.finances, tickets: 30000, media: 40000, merch: 5000 };
    expect(nextBudget(team)).toBeLessThan(rich);
    expect(totalRevenue(team.lastFinances)).toBe(75000 + team.lastFinances.playoffs);
  });

  it('winning raises fan interest', () => {
    team.wins = 30;
    team.losses = 10;
    const hot = fanInterestTarget(team, players);
    team.wins = 10;
    team.losses = 30;
    expect(fanInterestTarget(team, players)).toBeLessThan(hot - 20);
  });
});
