import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { Rng } from '../rng';
import { ensureCareerDefaults } from './career';
import { moraleFactors, moraleLabel, refusesToResign, updateMorale } from './morale';
import { generateSchedule } from './schedule';
import { seasonOver, simDay, type SeasonState } from './season';

function season(seed: number): SeasonState {
  const { league, teams, players } = generateLeague(seed);
  const s: SeasonState = { league, teams, players, schedule: generateSchedule(teams, 162, league.season, new Rng(seed)), stats: new Map(), userTeamId: 0, seed };
  ensureCareerDefaults(s);
  return s;
}

describe('morale', () => {
  const s = season(51);
  while (!seasonOver(s)) simDay(s);
  const rostered = s.players.filter((p) => p.teamId !== null && !p.retired);

  it('spreads across the scale with most players content', () => {
    const labels = rostered.map((p) => moraleLabel(p.morale));
    const content = labels.filter((l) => l === 'Content' || l === 'Happy').length / labels.length;
    expect(content).toBeGreaterThan(0.6);
    // The happiest players sit near the 'Happy' line (65); whether one crosses it depends on the season.
    expect(Math.max(...rostered.map((p) => p.morale ?? 50))).toBeGreaterThanOrEqual(60);
    expect(labels.some((l) => l === 'Unhappy' || l === 'Miserable')).toBe(true);
  });

  it('winning teams are happier than losing teams', () => {
    const avg = (teamId: number) => {
      const ps = rostered.filter((p) => p.teamId === teamId);
      return ps.reduce((sum, p) => sum + (p.morale ?? 50), 0) / ps.length;
    };
    const ranked = [...s.teams].sort((a, b) => b.wins - a.wins);
    expect(avg(ranked[0]!.id)).toBeGreaterThan(avg(ranked[ranked.length - 1]!.id) + 5);
  });

  it('explains itself and blocks re-signing when miserable', () => {
    const p = rostered.find((x) => moraleFactors(x, s).length > 0)!;
    expect(moraleFactors(p, s)[0]!.label.length).toBeGreaterThan(3);
    const vet = rostered.find((x) => (x.experience ?? 0) >= 6)!;
    vet.morale = 15;
    expect(refusesToResign(vet)).toBe(true);
    vet.morale = 60;
    expect(refusesToResign(vet)).toBe(false);
  });

  it('only updates weekly unless forced', () => {
    const before = s.league.moraleDate;
    updateMorale(s);
    expect(s.league.moraleDate).toBe(before);
    updateMorale(s, true);
    expect(s.league.moraleDate).toBe(s.league.date);
  });
});
