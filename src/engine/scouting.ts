import { RATING_MAX, RATING_MIN } from './model/ratings';
import type { Rating } from './model/types';
import { hashString, Rng } from './rng';

/**
 * Scouting turns true ratings into the noisy estimates the player sees.
 * Accuracy is 0–1 (1 = perfect information). Noise is deterministic per
 * player + field so a report doesn't change every time it is viewed.
 */
export interface ScoutedRating {
  value: Rating;
  /** +/- range the scout is reasonably confident in. */
  margin: number;
}

export function scoutRating(trueValue: Rating, scoutSeed: number, field: string, accuracy: number): ScoutedRating {
  const rng = new Rng((scoutSeed ^ hashString(field)) >>> 0);
  const sd = (1 - Math.max(0, Math.min(1, accuracy))) * 10;
  const noisy = trueValue + rng.normal(0, sd);
  const value = Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(noisy / 5) * 5));
  return { value, margin: Math.round(sd * 1.5) };
}
