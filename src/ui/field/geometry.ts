import { FIELDER_SPOTS, fenceDistance, type Fielder } from '../../engine';

/** SVG canvas for the field. Home plate sits near the bottom, center field at the top. */
export const FIELD_W = 400;
export const FIELD_H = 358;
export const HOME = { x: 200, y: 334 };
/** Pixels per foot. */
export const SCALE = 0.72;

export interface Pt {
  x: number;
  y: number;
}

/** Field position from a spray angle (degrees, 0 = center field) and distance in feet. */
export function polar(angle: number, feet: number): Pt {
  const r = (angle * Math.PI) / 180;
  return { x: HOME.x + feet * SCALE * Math.sin(r), y: HOME.y - feet * SCALE * Math.cos(r) };
}

/** Bases 0 (home) to 3; 4 is home again for scoring runners. */
export function basePoint(base: number): Pt {
  switch (base % 4) {
    case 1: return polar(45, 90);
    case 2: return polar(0, 127.3);
    case 3: return polar(-45, 90);
    default: return { ...HOME };
  }
}

export const MOUND = polar(0, 60.5);

export function fielderSpot(f: Fielder): Pt {
  const [angle, dist] = FIELDER_SPOTS[f];
  return polar(angle, dist);
}

/** Where each fielder stands to take a throw at a base. */
export function coverPoint(f: Fielder): Pt {
  switch (f) {
    case 3: return basePoint(1);
    case 4: case 6: return basePoint(2);
    case 5: return basePoint(3);
    case 2: case 1: return basePoint(0);
    default: return fielderSpot(f);
  }
}

/** SVG path for the outfield wall, sampled along the fence curve. */
export function fencePath(offsetFeet = 0): string {
  const pts: string[] = [];
  for (let a = -45; a <= 45; a += 3) {
    const p = polar(a, fenceDistance(a) + offsetFeet);
    pts.push(`${pts.length ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
  }
  return pts.join(' ');
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
