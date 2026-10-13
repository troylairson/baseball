import { countAfter, type Fielder, type PlayEvent } from '../../engine';
import { basePoint, coverPoint, dist, fielderSpot, HOME, lerp, MOUND, polar, SCALE, type Pt } from './geometry';

/**
 * Turns a play event into a timeline: keyframed paths for the ball, fielders
 * and runners plus timed overlays. Pure and deterministic, so it can be
 * tested without a browser and skipped by jumping to the end.
 */

export interface Frame {
  t: number;
  x: number;
  y: number;
  /** Height above the ground in feet (ball only). */
  z?: number;
  /** Opacity 0–1. */
  o?: number;
}

export interface Track {
  key: string;
  frames: Frame[];
}

export type Mark =
  | { t: number; kind: 'count'; balls: number; strikes: number }
  | { t: number; kind: 'badge'; text: string; at: Pt; tone: 'out' | 'safe' | 'k' | 'error' | 'hr' }
  | { t: number; kind: 'land'; at: Pt }
  | { t: number; kind: 'flash' }
  /** The outcome is decided: the caption can say what happened. */
  | { t: number; kind: 'reveal' };

export interface Timeline {
  duration: number;
  tracks: Track[];
  marks: Mark[];
}

export type Speed = 'pitch' | 'play' | 'instant';

const PITCH_MS = 420;
const BETWEEN_PITCHES_MS = 260;
const BASE_MS = 520;
const THROW_FT_PER_MS = 0.12;

const FIELDERS: Fielder[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const coverBase = (f: Fielder): number => (f === 3 ? 1 : f === 4 || f === 6 ? 2 : f === 5 ? 3 : 0);

class Builder {
  tracks = new Map<string, Frame[]>();
  marks: Mark[] = [];
  end = 0;

  at(key: string): Frame | undefined {
    const f = this.tracks.get(key);
    return f?.[f.length - 1];
  }

  /** Add a keyframe; the element holds its previous position until `t0` if given. */
  move(key: string, to: Pt & { z?: number; o?: number }, t: number, t0?: number): void {
    let f = this.tracks.get(key);
    if (!f) this.tracks.set(key, (f = []));
    const last = f[f.length - 1];
    if (t0 !== undefined && last && t0 > last.t) f.push({ ...last, t: t0 });
    f.push({ t, x: to.x, y: to.y, z: to.z, o: to.o ?? last?.o ?? 1 });
    this.end = Math.max(this.end, t);
  }

  place(key: string, p: Pt & { z?: number; o?: number }, t = 0): void {
    this.tracks.set(key, [{ t, x: p.x, y: p.y, z: p.z, o: p.o ?? 1 }]);
  }

  mark(m: Mark): void {
    this.marks.push(m);
    this.end = Math.max(this.end, m.t);
  }

  build(pad = 250): Timeline {
    return {
      duration: this.end + pad,
      tracks: [...this.tracks.entries()].map(([key, frames]) => ({ key, frames })),
      marks: this.marks.sort((a, b) => a.t - b.t),
    };
  }
}

/** Ball flight from a to b with a parabolic height, as sampled frames. */
function flight(b: Builder, from: Pt, to: Pt, apex: number, t0: number, t1: number, startZ = 3, endZ = 0): void {
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const p = lerp(from, to, u);
    const z = startZ + (endZ - startZ) * u + 4 * (apex - Math.max(startZ, endZ) / 2) * u * (1 - u);
    b.move('ball', { ...p, z: Math.max(0, z) }, t0 + (t1 - t0) * u);
  }
}

/** A ground ball: low hops along the ground. */
function roll(b: Builder, from: Pt, to: Pt, t0: number, t1: number): void {
  const hops = [0.18, 0.4, 0.62, 0.82, 1];
  let prev = 0;
  for (const h of hops) {
    const mid = (prev + h) / 2;
    b.move('ball', { ...lerp(from, to, mid), z: 4 * (1 - mid) + 0.5 }, t0 + (t1 - t0) * mid);
    b.move('ball', { ...lerp(from, to, h), z: 0 }, t0 + (t1 - t0) * h);
    prev = h;
  }
}

/** A throw between two points; returns the arrival time. */
function toss(b: Builder, from: Pt, to: Pt, t0: number): number {
  const t1 = t0 + Math.max(220, dist(from, to) / SCALE / THROW_FT_PER_MS / 6);
  flight(b, from, to, Math.min(14, 4 + dist(from, to) / SCALE / 25), t0, t1, 5, 5);
  return t1;
}

/** Path along the base paths from one base to another. */
function runPath(b: Builder, key: string, from: number, to: number, t0: number, perBase: number): number {
  let t = t0;
  for (let base = from + 1; base <= to; base++) {
    t += perBase;
    b.move(key, basePoint(base), t, base === from + 1 ? t0 : undefined);
  }
  return t;
}

export interface DirectorInput {
  event: PlayEvent;
  /** Where each runner (and the batter) starts. */
  speed: Speed;
}

/** The resting layout: fielders at their spots, runners on base, batter at the plate. */
export function restingFrames(bases: (number | null)[], batterId: number | null): Builder {
  const b = new Builder();
  for (const f of FIELDERS) b.place(`f${f}`, fielderSpot(f));
  b.place('ball', { ...MOUND, z: 6, o: 0 });
  bases.forEach((id, i) => id !== null && b.place(`r${id}`, basePoint(i + 1)));
  if (batterId !== null) b.place(`r${batterId}`, { x: HOME.x + 11, y: HOME.y - 4 });
  return b;
}

export function buildTimeline({ event: e, speed }: DirectorInput): Timeline {
  const before: (number | null)[] = [null, null, null];
  for (const r of e.runners) if (r.from > 0) before[r.from - 1] = r.id;
  const b = restingFrames(before, e.kind === 'pa' && e.batterId !== undefined ? e.batterId : null);
  if (e.kind === 'pitchingChange' || e.kind === 'pinchHit') {
    b.mark({ t: 0, kind: 'reveal' });
    b.end = 1100;
    return b.build(0);
  }

  let t = 0;
  // --- Pitches ---------------------------------------------------------------
  const pitches = e.pitches ?? [];
  const shown = speed === 'pitch' ? pitches : pitches.slice(-1);
  const skipped = pitches.length - shown.length;
  if (e.result === 'IBB') {
    // Four lobs wide of the plate, quickly.
    for (let i = 0; i < 4; i++) {
      b.move('ball', { ...MOUND, z: 6, o: 1 }, t, t);
      b.move('ball', { x: HOME.x + 14, y: HOME.y - 4, z: 5 }, t + 300);
      b.mark({ t: t + 300, kind: 'count', balls: i + 1, strikes: 0 });
      t += 380;
    }
    b.move('ball', { x: HOME.x + 14, y: HOME.y - 4, z: 5, o: 0 }, t);
  } else {
    if (skipped > 0) {
      const [bb, ss] = countAfter(pitches, skipped);
      b.mark({ t: 0, kind: 'count', balls: bb, strikes: ss });
    }
    shown.forEach((p, i) => {
      const n = skipped + i + 1;
      const release = t;
      b.move('ball', { ...MOUND, z: 6, o: 1 }, release, release);
      const arrive = release + PITCH_MS;
      const last = n === pitches.length;
      const plate = { x: HOME.x + (p === 'B' ? (i % 2 ? 9 : -9) : 0), y: HOME.y - 3 };
      flight(b, MOUND, plate, 6, release, arrive, 6, 3);
      if (!last || p !== 'X') {
        const [bb, ss] = countAfter(pitches, n);
        b.mark({ t: arrive, kind: 'count', balls: Math.min(3, bb), strikes: Math.min(2, ss) });
        if (!last || e.kind === 'steal') {
          b.move('ball', { ...plate, z: 3, o: 0 }, arrive + 120);
          t = arrive + BETWEEN_PITCHES_MS;
        } else {
          t = arrive;
        }
      } else {
        t = arrive;
      }
    });
  }
  const contact = t;

  // --- Steal -----------------------------------------------------------------
  if (e.kind === 'steal') {
    const r = e.runners[0]!;
    const release = Math.max(0, contact - PITCH_MS);
    const arrive = runPath(b, `r${r.id}`, 1, 2, release, BASE_MS * 2.2);
    const catcher = fielderSpot(2);
    const cover = e.fielders?.[1] ?? 6;
    b.move(`f${cover}`, coverPoint(cover), arrive - 80, release);
    b.move('ball', { ...catcher, z: 4, o: 1 }, contact + 60);
    toss(b, catcher, basePoint(2), arrive - (r.out ? 160 : -60));
    b.mark({ t: arrive, kind: 'badge', text: r.out ? 'Out' : 'Safe', at: basePoint(2), tone: r.out ? 'out' : 'safe' });
    if (r.out) b.move(`r${r.id}`, { ...basePoint(2), o: 0 }, arrive + 500, arrive + 250);
    b.mark({ t: arrive, kind: 'reveal' });
    return b.build(400);
  }

  // --- Batted ball -----------------------------------------------------------
  const ball = e.ball;
  const fielders = e.fielders ?? [];
  /** When the ball reaches each base on a throw (for syncing outs). */
  const ballAtBase = new Map<number, number>();
  let fieldedAt = contact;
  let ballPos: Pt = { x: HOME.x, y: HOME.y - 3 };
  if (ball) {
    const land = polar(ball.angle, ball.distance);
    const hangMs = ball.type === 'ground' || ball.type === 'bunt'
      ? Math.min(1300, 280 + ball.distance * 4.2)
      : Math.min(2300, Math.max(520, Math.sqrt(ball.apex) * 170));
    fieldedAt = contact + hangMs;
    if (ball.type === 'ground' || ball.type === 'bunt') roll(b, ballPos, land, contact, fieldedAt);
    else flight(b, ballPos, land, ball.apex, contact, fieldedAt, 3, e.result === 'HR' ? 25 : ball.type === 'line' ? 2 : 4);
    b.mark({ t: fieldedAt, kind: 'land', at: land });
    ballPos = land;
    if (e.result === 'HR') {
      b.move('ball', { ...land, z: 20, o: 0 }, fieldedAt + 250);
      b.mark({ t: fieldedAt, kind: 'flash' });
      b.mark({ t: fieldedAt + 100, kind: 'badge', text: 'Home run', at: { x: land.x, y: Math.max(18, land.y + 10) }, tone: 'hr' });
    }

    const first = fielders[0];
    if (first !== undefined) {
      // The fielder converges on the ball; hits are retrieved a beat after landing.
      const isHit = e.result === '1B' || e.result === '2B' || e.result === '3B' || e.result === 'BUNT_HIT';
      const getTo = isHit && (e.result === '2B' || e.result === '3B') ? polar(ball.angle, ball.distance - 4) : land;
      const arrive = fieldedAt + (isHit ? (e.result === '1B' ? 150 : 450) : -40);
      b.move(`f${first}`, getTo, arrive, contact + 120);
      if (isHit) {
        b.move('ball', { ...getTo, z: 0 }, arrive);
        fieldedAt = arrive;
        ballPos = getTo;
      }
      if (e.error) {
        // The ball gets by him.
        const past = polar(ball.angle, ball.distance + 22);
        b.move('ball', { ...past, z: 0 }, fieldedAt + 350);
        b.move(`f${first}`, past, fieldedAt + 700);
        b.mark({ t: fieldedAt + 150, kind: 'badge', text: `E${e.error}`, at: land, tone: 'error' });
        fieldedAt += 700;
        ballPos = past;
      }
      // Relays and throws.
      let holderPos = isHit || e.error ? ballPos : land;
      if (fielders.length === 1 && first === 3 && !isHit && !e.error && ball.type === 'ground') {
        // First baseman takes it to the bag himself.
        fieldedAt += 300;
        b.move('f3', basePoint(1), fieldedAt);
        b.move('ball', { ...basePoint(1), z: 3 }, fieldedAt);
        ballAtBase.set(1, fieldedAt);
      }
      for (const next of fielders.slice(1)) {
        const target = isHit ? lerp(holderPos, basePoint(2), 0.55) : coverPoint(next);
        b.move(`f${next}`, target, fieldedAt + 250, contact + 150);
        fieldedAt = toss(b, holderPos, target, fieldedAt + 120);
        if (!isHit) ballAtBase.set(coverBase(next), fieldedAt);
        holderPos = target;
      }
    }
  } else if (e.result === 'K') {
    b.mark({ t: contact + 80, kind: 'badge', text: 'K', at: { x: HOME.x - 22, y: HOME.y - 18 }, tone: 'k' });
    b.move('ball', { x: HOME.x, y: HOME.y + 4, z: 3, o: 0 }, contact + 400);
  } else {
    b.move('ball', { x: HOME.x, y: HOME.y + 4, z: 3, o: 0 }, contact + 200);
  }

  // --- Runners ---------------------------------------------------------------
  const ordered = [...e.runners].sort((a, z) => z.from - a.from);
  for (const r of ordered) {
    const key = `r${r.id}`;
    const start = r.from === 0 ? contact + 60 : contact;
    if (r.out && r.to === 0) {
      // Strikeout or caught ball: the batter heads back to the dugout.
      const leave = ball ? fieldedAt : contact + 300;
      b.move(key, { x: HOME.x + 30, y: HOME.y + 8, o: 0 }, leave + 500, leave);
      continue;
    }
    const target = r.to === 4 ? 4 : r.to;
    if (target <= r.from) continue;
    // Forced runners and the batter sprint; tagging runners wait for the catch.
    const caught = ball && (ball.type === 'fly' || ball.type === 'popup' || ball.type === 'line') && e.result !== 'HR'
      && e.result !== '1B' && e.result !== '2B' && e.result !== '3B';
    const go = caught && r.from > 0 ? fieldedAt : e.result === 'HR' ? contact + 300 : start;
    let perBase = e.result === 'HR' ? BASE_MS * 1.15 : BASE_MS;
    if (r.out) {
      // Arrive a beat after the ball does.
      const ballThere = ballAtBase.get(target) ?? fieldedAt;
      perBase = Math.max(perBase * 0.6, (ballThere + 110 - go) / (target - r.from));
    }
    const done = runPath(b, key, r.from, target, go, perBase);
    if (r.out) {
      b.mark({ t: done, kind: 'badge', text: 'Out', at: basePoint(target), tone: 'out' });
      b.move(key, { ...basePoint(target), o: 0 }, done + 450, done + 200);
    } else if (target === 4) {
      b.move(key, { ...HOME, o: 0 }, done + 350, done + 100);
    }
  }
  const settled = Math.max(contact, ...b.marks.filter((m) => m.kind === 'badge').map((m) => m.t), ball ? fieldedAt : contact);
  b.mark({ t: e.result === 'HR' ? contact + 400 : settled, kind: 'reveal' });
  if (e.result === 'BB' || e.result === 'HBP') {
    b.mark({ t: contact + 60, kind: 'badge', text: e.result === 'BB' ? 'Ball four' : 'Hit by pitch', at: { x: HOME.x + 26, y: HOME.y - 16 }, tone: 'safe' });
  }
  return b.build(450);
}

// ---------------------------------------------------------------------------
// Sampling

/** Interpolated position of a track at time t (holds the last frame). */
export function sample(frames: Frame[], t: number): Frame {
  if (t <= frames[0]!.t) return frames[0]!;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!;
    const z = frames[i]!;
    if (t <= z.t) {
      const u = z.t === a.t ? 1 : (t - a.t) / (z.t - a.t);
      return {
        t,
        x: a.x + (z.x - a.x) * u,
        y: a.y + (z.y - a.y) * u,
        z: (a.z ?? 0) + ((z.z ?? 0) - (a.z ?? 0)) * u,
        o: (a.o ?? 1) + ((z.o ?? 1) - (a.o ?? 1)) * u,
      };
    }
  }
  return frames[frames.length - 1]!;
}
