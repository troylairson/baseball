import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 10 }, () => a.next())).toEqual(Array.from({ length: 10 }, () => b.next()));
  });

  it('accepts string seeds', () => {
    expect(new Rng('abc').next()).toBe(new Rng('abc').next());
    expect(new Rng('abc').next()).not.toBe(new Rng('abd').next());
  });

  it('produces values in range', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it('normal() has roughly the requested mean and sd', () => {
    const rng = new Rng(7);
    const xs = Array.from({ length: 20_000 }, () => rng.normal(50, 10));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(mean).toBeCloseTo(50, 0);
    expect(sd).toBeGreaterThan(9.5);
    expect(sd).toBeLessThan(10.5);
  });

  it('forks are reproducible and independent of each other', () => {
    const a = new Rng(9).fork('x').next();
    expect(new Rng(9).fork('x').next()).toBe(a);
    expect(new Rng(9).fork('y').next()).not.toBe(a);
  });
});
