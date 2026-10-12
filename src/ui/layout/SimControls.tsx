import { useState } from 'react';
import { useGame } from '../../state/game';
import type { SimMode } from '../../worker/api';
import { BottomSheet } from '../components/BottomSheet';
import { Icon } from '../components/Icon';
import { formatDate } from '../format';

const OPTIONS: { mode: SimMode; label: string; detail: string }[] = [
  { mode: 'next', label: 'Next game', detail: 'Play through your next game' },
  { mode: 'week', label: 'One week', detail: 'Sim the next 7 days' },
  { mode: 'month', label: 'One month', detail: 'Sim the next 30 days' },
  { mode: 'season', label: 'Rest of season', detail: 'Sim to the end of the regular season' },
];

/** Split button: tap to play the next game, chevron for longer sims. */
export function SimButton() {
  const save = useGame((s) => s.save)!;
  const simulate = useGame((s) => s.simulate);
  const running = useGame((s) => s.sim !== null);
  const [menu, setMenu] = useState(false);
  const over = save.schedule.every((g) => g.played);
  const label = over ? 'Final' : save.league.phase === 'preseason' ? 'Play ball' : 'Play';

  return (
    <>
      <div className="flex h-10 overflow-hidden rounded-full bg-accent text-accent-contrast">
        <button
          onClick={() => simulate('next')}
          disabled={over || running}
          className="flex items-center gap-1.5 pl-4 pr-3 text-sm font-semibold disabled:opacity-50"
        >
          <Icon name="play" className="size-4" /> {label}
        </button>
        <button
          onClick={() => setMenu(true)}
          disabled={over || running}
          className="grid w-9 place-items-center border-l border-accent-contrast/20 disabled:opacity-50"
          aria-label="More sim options"
        >
          <Icon name="chevron" className="size-4 rotate-90" />
        </button>
      </div>
      <BottomSheet open={menu} onClose={() => setMenu(false)} title="Simulate">
        <h2 className="mb-1 text-xl font-bold">Simulate</h2>
        <p className="mb-4 text-sm text-muted">Today is {formatDate(save.league.date)}.</p>
        <ul className="flex flex-col gap-2">
          {OPTIONS.map((o) => (
            <li key={o.mode}>
              <button
                onClick={() => {
                  setMenu(false);
                  void simulate(o.mode);
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left hover:bg-surface-2"
              >
                <span className="flex-1">
                  <span className="block font-semibold">{o.label}</span>
                  <span className="block text-sm text-muted">{o.detail}</span>
                </span>
                <Icon name="play" className="size-4 text-accent" />
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}

/** Progress strip shown under the top bar during longer sims. */
export function SimProgressBar() {
  const sim = useGame((s) => s.sim);
  const stop = useGame((s) => s.stopSim);
  if (!sim || sim.mode === 'next') return null;
  const pct = Math.round((sim.progress?.fraction ?? 0) * 100);
  return (
    <div className="border-t border-line bg-surface px-4 py-2 md:px-8" role="status" aria-live="polite">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Simulating{sim.progress ? ` · ${formatDate(sim.progress.date)}` : '…'}</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button onClick={stop} className="h-8 rounded-full border border-line px-3 text-xs font-semibold hover:bg-surface-2">Stop</button>
      </div>
    </div>
  );
}
