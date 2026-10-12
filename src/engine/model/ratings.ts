import type { BattingRatings, PitchingRatings, Player, Rating } from './types';

export const RATING_MIN = 20;
export const RATING_MAX = 80;

export function clampRating(value: number): Rating {
  return Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(value)));
}

/** Round to the nearest 5, as scouts report grades. */
export function toScoutGrade(value: number): Rating {
  return clampRating(Math.round(value / 5) * 5);
}

export function isPitcher(p: Pick<Player, 'position'>): boolean {
  return p.position === 'SP' || p.position === 'RP';
}

/** Weighted offensive value; positional value is applied in overall(). */
export function battingOverall(b: BattingRatings): number {
  return b.contact * 0.35 + b.power * 0.3 + b.eye * 0.25 + b.speed * 0.1;
}

export function pitchingOverall(p: PitchingRatings, starter: boolean): number {
  const core = p.stuff * 0.4 + p.control * 0.3 + p.movement * 0.3;
  // Starters need stamina; relievers are judged almost purely on stuff.
  return starter ? core * 0.85 + p.stamina * 0.15 : core;
}

/** Defensive weight by position: how much glove matters there. */
const DEFENSE_WEIGHT: Record<string, number> = {
  C: 0.35, SS: 0.35, CF: 0.3, '2B': 0.28, '3B': 0.25, RF: 0.2, LF: 0.15, '1B': 0.1, DH: 0,
};

export function overall(player: Player, potential = false): Rating {
  if (isPitcher(player)) {
    const ratings = potential ? player.pitchingPotential : player.pitching;
    return clampRating(pitchingOverall(ratings!, player.position === 'SP'));
  }
  const bat = battingOverall(potential ? player.battingPotential : player.batting);
  const w = DEFENSE_WEIGHT[player.position] ?? 0.2;
  // DH and 1B take a small penalty: their bats must carry them.
  const positional = player.position === 'DH' ? -4 : player.position === '1B' ? -2 : 0;
  return clampRating(bat * (1 - w) + player.fielding.defense * w + positional);
}
