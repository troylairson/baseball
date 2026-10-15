import {
  fastballVelo, generateArsenal, mixTraits, pitchGrade, PITCH_NAMES, pitchVelo, type Arsenal as ArsenalT, type Player,
} from '../../engine';
import { scouted } from '../scouting';
import { RatingBadge } from './Rating';

/** The pitcher's repertoire (without creating one on the snapshot). */
export function arsenalFor(p: Player): ArsenalT | null {
  if (!p.pitching) return null;
  return p.arsenal ?? generateArsenal(p);
}

/** Plain-language read on what the mix makes him. */
export function arsenalTraits(p: Player): string[] {
  const a = arsenalFor(p);
  if (!a || !p.pitching) return [];
  const m = mixTraits(a, p.pitching);
  const out: string[] = [];
  if (fastballVelo(a, p.pitching) >= 97) out.push('Power arm');
  if (m.gb >= 0.3) out.push('Ground-ball pitcher');
  else if (m.gb <= -0.35) out.push('Fly-ball pitcher');
  if (m.breaking >= 0.2) out.push('Tough on same-side hitters');
  if (m.offspeed >= 0.15) out.push('Neutralizes opposite-side hitters');
  if (p.position === 'SP') {
    if (m.depth >= 4) out.push('Deep arsenal: holds up third time through');
    else if (m.depth <= 2) out.push('Thin arsenal: fades third time through');
  }
  return out;
}

/** Pitch-by-pitch card for the player sheet: grade (as your scouts see it), speed and usage. */
export function ArsenalCard({ player, userTeamId }: { player: Player; userTeamId: number }) {
  const a = arsenalFor(player);
  if (!a || !player.pitching) return null;
  const traits = arsenalTraits(player);
  return (
    <div>
      <ul className="divide-y divide-line">
        {a.pitches.map((x) => {
          const grade = scouted(player, `pitch-${x.type}`, pitchGrade(x, player.pitching!), userTeamId).value;
          const velo = Math.round(pitchVelo(x.type, a, player.pitching!));
          return (
            <li key={x.type} className="flex items-center gap-3 py-2">
              <span className="w-9 shrink-0 rounded bg-surface-2 py-0.5 text-center text-[11px] font-bold text-muted">{x.type}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{PITCH_NAMES[x.type]}</span>
                <span className="block text-xs text-muted tabular-nums">
                  {velo} mph · thrown {Math.round(x.usage * 100)}%
                </span>
              </span>
              <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-surface-2 sm:block" aria-hidden>
                <span className="block h-full rounded-full bg-accent/70" style={{ width: `${Math.round(x.usage * 100)}%` }} />
              </span>
              <RatingBadge value={grade} size="sm" />
            </li>
          );
        })}
      </ul>
      {traits.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {traits.map((t) => <span key={t} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium">{t}</span>)}
        </div>
      )}
    </div>
  );
}

/** Compact "FF 96 · SL · CH" summary for tight spaces. */
export function arsenalSummary(p: Player): string | null {
  const a = arsenalFor(p);
  if (!a || !p.pitching) return null;
  return a.pitches.map((x, i) => (i === 0 ? `${x.type} ${Math.round(pitchVelo(x.type, a, p.pitching!))}` : x.type)).join(' · ');
}
