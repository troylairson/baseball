import { overall } from '../model/ratings';
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
  speed: number;
  /** Average stamina of major league starters. */
  stamina: number;
}

/** Weighted averages (see computeNorms) of a freshly generated league, which the PA model is calibrated against. */
export const BASE_NORMS: RatingNorms = { contact: 53, power: 51.8, eye: 52.9, stuff: 51.9, control: 51.6, movement: 52.1, defense: 53.4, speed: 50.9, stamina: 62.1 };

/**
 * Playing-time-weighted averages: regulars and front-line pitchers count
 * most, because they take most of the plate appearances. That keeps the run
 * environment stable whether a league's bench is much weaker than its
 * starters (generated leagues) or nearly as good (real rosters).
 */
export function computeNorms(players: Player[]): RatingNorms {
  const byTeam = new Map<number, Player[]>();
  for (const p of players) {
    if (p.teamId === null || p.level !== 'MLB' || p.retired) continue;
    let list = byTeam.get(p.teamId);
    if (!list) byTeam.set(p.teamId, (list = []));
    list.push(p);
  }
  const sums: Record<keyof RatingNorms, [number, number]> = {
    contact: [0, 0], power: [0, 0], eye: [0, 0], stuff: [0, 0], control: [0, 0], movement: [0, 0], defense: [0, 0], speed: [0, 0], stamina: [0, 0],
  };
  const add = (k: keyof RatingNorms, v: number, w: number) => { sums[k][0] += v * w; sums[k][1] += w; };
  for (const roster of byTeam.values()) {
    const hitters = roster.filter((p) => !p.pitching).sort((a, b) => overall(b) - overall(a));
    hitters.forEach((p, i) => {
      const w = i < 9 ? 1 : 0.15;
      add('contact', p.batting.contact, w);
      add('power', p.batting.power, w);
      add('eye', p.batting.eye, w);
      add('speed', p.batting.speed, w);
      if (p.position !== 'DH') add('defense', p.fielding.defense, w);
    });
    const starters = roster.filter((p) => p.pitching && p.position === 'SP').sort((a, b) => overall(b) - overall(a));
    const relievers = roster.filter((p) => p.pitching && p.position !== 'SP').sort((a, b) => overall(b) - overall(a));
    const pitch = (p: Player, w: number) => {
      add('stuff', p.pitching!.stuff, w);
      add('control', p.pitching!.control, w);
      add('movement', p.pitching!.movement, w);
    };
    starters.forEach((p, i) => {
      pitch(p, i < 5 ? 2.2 : 0.3);
      if (i < 5) add('stamina', p.pitching!.stamina, 1);
    });
    relievers.forEach((p, i) => pitch(p, i < 7 ? 1 : 0.3));
  }
  const mean = (k: keyof RatingNorms) => (sums[k][1] ? sums[k][0] / sums[k][1] : BASE_NORMS[k]);
  return {
    contact: mean('contact'), power: mean('power'), eye: mean('eye'), stuff: mean('stuff'), control: mean('control'),
    movement: mean('movement'), defense: mean('defense'), speed: mean('speed'), stamina: mean('stamina'),
  };
}
