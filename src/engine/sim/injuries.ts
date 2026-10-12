import type { Injury, Player } from '../model/types';
import type { Rng } from '../rng';
import type { GameResult } from './game';

const HITTER_INJURIES: [string, number, number][] = [
  // description, min days, max days
  ['hamstring strain', 10, 30], ['sprained ankle', 10, 25], ['oblique strain', 15, 40], ['wrist inflammation', 10, 20],
  ['concussion', 7, 15], ['back spasms', 10, 18], ['fractured hand', 35, 60], ['knee sprain', 20, 45],
];
const PITCHER_INJURIES: [string, number, number][] = [
  ['shoulder inflammation', 15, 40], ['elbow soreness', 10, 30], ['forearm strain', 20, 50], ['blister', 10, 15],
  ['lat strain', 30, 70], ['back tightness', 10, 20],
];
const SEVERE: Record<'hit' | 'pitch', [string, number, number]> = {
  hit: ['torn ACL', 150, 240],
  pitch: ['torn UCL (Tommy John surgery)', 300, 420],
};

/** Per-game injury odds for a typical player. */
const RATE = { hitter: 0.0035, starter: 0.018, reliever: 0.007 };

function riskFactor(p: Player): number {
  return (0.5 + p.injuryProneness * 1.7) * (1 + Math.max(0, p.age - 30) * 0.04);
}

export interface NewInjury {
  playerId: number;
  injury: Injury;
}

/**
 * Roll injuries for everyone who played. A better trainer (20–80) trims
 * recovery time by up to about a quarter.
 */
export function rollInjuries(result: GameResult, players: Map<number, Player>, rng: Rng, trainer = (_teamId: number) => 50): NewInjury[] {
  const out: NewInjury[] = [];
  for (const box of [result.home, result.away]) {
    const trainerMul = 1 - (trainer(box.teamId) - 50) / 120;
    const consider = (p: Player | undefined, rate: number, kind: 'hit' | 'pitch') => {
      if (!p || p.injury || !rng.chance(rate * riskFactor(p))) return;
      const severe = rng.chance(kind === 'pitch' ? 0.04 : 0.03);
      const [description, min, max] = severe ? SEVERE[kind] : rng.pick(kind === 'pitch' ? PITCHER_INJURIES : HITTER_INJURIES);
      const days = Math.max(1, Math.round(rng.int(min, max) * trainerMul));
      out.push({ playerId: p.id, injury: { days, description } });
    };
    for (const b of box.batters) {
      if (b.line.pa > 0 && b.position !== 'P') consider(players.get(b.playerId), RATE.hitter, 'hit');
    }
    for (const a of box.pitchers) consider(players.get(a.playerId), a.line.gs ? RATE.starter : RATE.reliever, 'pitch');
  }
  return out;
}
