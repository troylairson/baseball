import { gradeLabel } from '../format';

/**
 * Color ramp for the 20–80 scale. Blue (weak) → neutral → orange (strong) is
 * distinguishable for the common forms of color blindness.
 */
export function ratingTone(v: number): string {
  if (v >= 70) return 'bg-orange-600 text-white';
  if (v >= 60) return 'bg-orange-400 text-orange-950';
  if (v >= 53) return 'bg-amber-200 text-amber-950 dark:bg-amber-300';
  if (v >= 47) return 'bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-100';
  if (v >= 40) return 'bg-sky-200 text-sky-950 dark:bg-sky-300';
  return 'bg-sky-600 text-white';
}

function barTone(v: number): string {
  if (v >= 70) return 'bg-orange-600';
  if (v >= 60) return 'bg-orange-400';
  if (v >= 53) return 'bg-amber-300';
  if (v >= 47) return 'bg-slate-400';
  if (v >= 40) return 'bg-sky-400';
  return 'bg-sky-600';
}

export function RatingBadge({ value, label, size = 'md' }: { value: number; label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'h-11 min-w-11 text-lg' : size === 'sm' ? 'h-6 min-w-7 text-xs' : 'h-8 min-w-9 text-sm';
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span
        className={`inline-flex items-center justify-center rounded-md px-1 font-semibold tabular-nums ${dims} ${ratingTone(value)}`}
        title={`${value} – ${gradeLabel(value)}`}
      >
        {value}
      </span>
      {label && <span className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</span>}
    </span>
  );
}

const pct = (v: number) => ((v - 20) / 60) * 100;

/** Horizontal bar: current value, potential marker and scouting uncertainty band. */
export function RatingBar({
  label, value, potential, margin = 0,
}: { label: string; value: number; potential?: number; margin?: number }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3 py-1.5">
      <span className="text-sm text-muted">{label}</span>
      <div className="relative h-2.5 rounded-full bg-surface-2" role="meter" aria-valuemin={20} aria-valuemax={80} aria-valuenow={value} aria-label={label}>
        {margin > 0 && (
          <div
            className="absolute inset-y-0 rounded-full bg-ink/10"
            style={{ left: `${Math.max(0, pct(value - margin))}%`, right: `${100 - Math.min(100, pct(value + margin))}%` }}
          />
        )}
        <div className={`absolute inset-y-0 left-0 rounded-full ${barTone(value)}`} style={{ width: `${pct(value)}%` }} />
        {potential !== undefined && potential > value && (
          <div className="absolute -inset-y-0.5 w-0.5 rounded bg-ink/60" style={{ left: `${pct(potential)}%` }} title={`Potential ${potential}`} />
        )}
      </div>
      <span className="text-right text-sm font-semibold tabular-nums">
        {value}
        {potential !== undefined && potential > value && <span className="font-normal text-muted">/{potential}</span>}
      </span>
    </div>
  );
}
