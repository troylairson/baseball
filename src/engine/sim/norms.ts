import type { Player } from '../model/types';

/**
 * League-average ratings of active major leaguers. The game engine judges
 * players relative to the league of their own era, so league-wide drift in
 * talent (aging curves, draft classes) doesn't inflate or deflate offense.
 */
export interface RatingNorms {
  contact: number;
  power: number;
  eye: number;
  stuff: number;
  control: number;
  movement: number;
  /** Average defense of regulars at their primary positions. */
  defense: number;
}

/** Averages of a freshly generated league, which the PA model is calibrated against. */
export const BASE_NORMS: RatingNorms = { contact: 50.4, power: 49, eye: 50.4, stuff: 50.9, control: 50.2, movement: 50.4, defense: 50.8 };

export function computeNorms(players: Player[]): RatingNorms {
  const active = players.filter((p) => p.teamId !== null && p.level === 'MLB' && !p.retired);
  const hitters = active.filter((p) => !p.pitching);
  const pitchers = active.filter((p) => p.pitching);
  const mean = <T>(list: T[], get: (x: T) => number, fallback: number) =>
    list.length ? list.reduce((s, x) => s + get(x), 0) / list.length : fallback;
  return {
    contact: mean(hitters, (p) => p.batting.contact, BASE_NORMS.contact),
    power: mean(hitters, (p) => p.batting.power, BASE_NORMS.power),
    eye: mean(hitters, (p) => p.batting.eye, BASE_NORMS.eye),
    stuff: mean(pitchers, (p) => p.pitching!.stuff, BASE_NORMS.stuff),
    control: mean(pitchers, (p) => p.pitching!.control, BASE_NORMS.control),
    movement: mean(pitchers, (p) => p.pitching!.movement, BASE_NORMS.movement),
    defense: mean(hitters.filter((p) => p.position !== 'DH'), (p) => p.fielding.defense, BASE_NORMS.defense),
  };
}
