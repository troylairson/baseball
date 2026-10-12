import type { Player, Position } from '../engine';

/** Salary is stored in $K. */
export function money(thousands: number): string {
  if (thousands >= 1000) return `$${(thousands / 1000).toFixed(thousands >= 10000 ? 0 : 1)}M`;
  return `$${thousands}K`;
}

export function fullName(p: Pick<Player, 'firstName' | 'lastName'>): string {
  return `${p.firstName} ${p.lastName}`;
}

export function shortName(p: Pick<Player, 'firstName' | 'lastName'>): string {
  return `${p.firstName[0]}. ${p.lastName}`;
}

export const POSITION_ORDER: Position[] = ['SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

export function byPosition(a: Player, b: Player): number {
  return POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position);
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Grade labels for the 20–80 scale. */
export function gradeLabel(v: number): string {
  if (v >= 75) return 'Elite';
  if (v >= 65) return 'Plus-plus';
  if (v >= 58) return 'Plus';
  if (v >= 53) return 'Above avg';
  if (v >= 48) return 'Average';
  if (v >= 43) return 'Below avg';
  if (v >= 35) return 'Fringe';
  return 'Poor';
}
