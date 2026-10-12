import { overall } from '../model/ratings';
import type { Player } from '../model/types';

export const ACTIVE_ROSTER_SIZE = 26;
const MIN_PITCHERS = 13;
const MIN_STARTERS = 5;
const MIN_CATCHERS = 2;

const isPitcher = (p: Player) => p.position === 'SP' || p.position === 'RP';

export interface RosterIssue {
  kind: 'count' | 'pitchers' | 'starters' | 'catchers';
  message: string;
}

const healthy = (p: Player) => !p.injury;

/** Problems with an active (MLB) roster. Injured players are on the IL and don't count. */
export function rosterIssues(mlb: Player[]): RosterIssue[] {
  const active = mlb.filter(healthy);
  const issues: RosterIssue[] = [];
  if (active.length !== ACTIVE_ROSTER_SIZE) {
    issues.push({ kind: 'count', message: `Active roster has ${active.length} players (needs ${ACTIVE_ROSTER_SIZE}).` });
  }
  const pitchers = active.filter(isPitcher);
  if (pitchers.length < MIN_PITCHERS - 1) issues.push({ kind: 'pitchers', message: `Only ${pitchers.length} pitchers on the active roster.` });
  if (active.filter((p) => p.position === 'SP').length < MIN_STARTERS) issues.push({ kind: 'starters', message: 'Fewer than five starting pitchers.' });
  if (active.filter((p) => p.position === 'C').length < MIN_CATCHERS) issues.push({ kind: 'catchers', message: 'Fewer than two catchers.' });
  return issues;
}

export interface RosterMove {
  playerId: number;
  to: 'MLB' | 'AAA';
}

/**
 * Bring a team's active roster to 26 with a sane shape (13 pitchers incl.
 * five starters, two catchers). With `upgrade`, also swaps clearly better
 * minor leaguers in, as AI teams do. Mutates players and returns the moves.
 */
export function fixRoster(org: Player[], upgrade = false): RosterMove[] {
  const moves: RosterMove[] = [];
  // Injured players stay where they are (MLB injured = on the IL).
  const active = () => org.filter((p) => p.level === 'MLB' && healthy(p));
  const minors = () => org.filter((p) => p.level === 'AAA' && healthy(p));
  const move = (p: Player, to: 'MLB' | 'AAA') => {
    p.level = to;
    moves.push({ playerId: p.id, to });
  };
  const best = (pool: Player[]) => pool.sort((a, b) => overall(b) - overall(a))[0];
  const worst = (pool: Player[]) => pool.sort((a, b) => overall(a) - overall(b))[0];

  // Fill structural needs first.
  const needs: [(p: Player) => boolean, number][] = [
    [(p) => p.position === 'SP', MIN_STARTERS],
    [(p) => p.position === 'C', MIN_CATCHERS],
    [isPitcher, MIN_PITCHERS],
  ];
  for (const [match, min] of needs) {
    while (active().filter(match).length < min) {
      const call = best(minors().filter(match));
      if (!call) break;
      move(call, 'MLB');
    }
  }

  // Too many: send down the weakest player whose group is above its minimum.
  while (active().length > ACTIVE_ROSTER_SIZE) {
    const a = active();
    const pitchers = a.filter(isPitcher).length;
    const candidates = a.filter((p) => {
      if (isPitcher(p)) return pitchers > MIN_PITCHERS && (p.position !== 'SP' || a.filter((x) => x.position === 'SP').length > MIN_STARTERS);
      return a.length - pitchers > ACTIVE_ROSTER_SIZE - MIN_PITCHERS && (p.position !== 'C' || a.filter((x) => x.position === 'C').length > MIN_CATCHERS);
    });
    const down = worst(candidates.length ? candidates : a);
    if (!down) break;
    move(down, 'AAA');
  }

  // Too few: call up the best player for whichever side is short.
  while (active().length < ACTIVE_ROSTER_SIZE) {
    const a = active();
    const needPitcher = a.filter(isPitcher).length < MIN_PITCHERS;
    const call = best(minors().filter((p) => isPitcher(p) === needPitcher)) ?? best(minors());
    if (!call) break;
    move(call, 'MLB');
  }

  if (upgrade) {
    for (const pitcher of [true, false]) {
      for (let i = 0; i < 3; i++) {
        const up = best(minors().filter((p) => isPitcher(p) === pitcher));
        const down = worst(active().filter((p) => isPitcher(p) === pitcher && p.position !== 'C' && p.position !== 'SP'));
        if (!up || !down || overall(up) < overall(down) + 4) break;
        if (up.position === 'SP' || up.position === 'C') {
          // Keep counts intact: only swap like for like.
          const sameDown = worst(active().filter((p) => p.position === up.position));
          if (!sameDown || overall(up) < overall(sameDown) + 4) break;
          move(sameDown, 'AAA');
        } else {
          move(down, 'AAA');
        }
        move(up, 'MLB');
      }
    }
  }
  return moves;
}
