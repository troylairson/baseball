import { overall, scoutingAccuracy, scoutRating, type Player, type ScoutedRating } from '../engine';
import { useGame } from '../state/game';

/**
 * How well the user's organization knows a player: own players well,
 * everyone else through the scouting department (director + budget).
 * Read from the store so every rating on screen uses the current department.
 */
export function accuracyFor(player: Player, userTeamId: number): number {
  const save = useGame.getState().save;
  const team = save?.teams.find((t) => t.id === userTeamId);
  if (!save || !team) return player.teamId === userTeamId ? 0.85 : 0.6;
  const acc = scoutingAccuracy(save.league, team);
  return player.teamId === userTeamId ? acc.own : acc.other;
}

export function scouted(player: Player, field: string, trueValue: number, userTeamId: number): ScoutedRating {
  return scoutRating(trueValue, player.scoutSeed, field, accuracyFor(player, userTeamId));
}

/**
 * Scouted potential. Scouts estimate the remaining growth rather than the
 * ceiling directly, so a finished veteran never appears to have upside.
 */
export function scoutedPotential(player: Player, field: string, current: number, scoutedCurrent: number, potential: number, userTeamId: number): number {
  const growth = potential - current;
  if (growth <= 0) return scoutedCurrent;
  return Math.max(scoutedCurrent, scoutedCurrent + scouted(player, `${field}-growth`, 20 + growth, userTeamId).value - 20);
}

export function scoutedOverall(player: Player, userTeamId: number): { ovr: number; pot: number } {
  const trueOvr = overall(player);
  const ovr = scouted(player, 'ovr', trueOvr, userTeamId).value;
  return { ovr, pot: scoutedPotential(player, 'ovr', trueOvr, ovr, overall(player, true), userTeamId) };
}
