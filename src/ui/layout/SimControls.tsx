import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, useGame } from '../../state/game';
import type { SimMode } from '../../worker/api';
import { BottomSheet } from '../components/BottomSheet';
import { Icon } from '../components/Icon';
import { formatDate } from '../format';

const SEASON_OPTIONS: { mode: SimMode; label: string; detail: string }[] = [
  { mode: 'next', label: 'Sim next game', detail: 'Let your staff play the next game' },
  { mode: 'week', label: 'One week', detail: 'Sim the next 7 days' },
  { mode: 'month', label: 'One month', detail: 'Sim the next 30 days' },
  { mode: 'season', label: 'Rest of season', detail: 'Sim to the end of the regular season' },
];
const PLAYOFF_OPTIONS: typeof SEASON_OPTIONS = [
  { mode: 'next', label: 'Sim next game', detail: 'Let your staff play the next playoff game' },
  { mode: 'playoffs', label: 'Rest of playoffs', detail: 'Sim until a champion is crowned' },
];

type Primary = { label: string; run: () => void; menu: boolean; disabled?: boolean };

/** Asks an open Manage Game screen to start the next game. */
export const PLAY_LIVE_EVENT = 'dgm:play-live';

/** Split button whose primary action follows the season: play, playoffs, offseason. */
export function SimButton() {
  const save = useGame((s) => s.save)!;
  const simulate = useGame((s) => s.simulate);
  const act = useGame((s) => s.act);
  const running = useGame((s) => s.sim !== null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  // Play means managing the game yourself; quick sims live in the menu.
  const playLive = () => (pathname === '/play/live' ? window.dispatchEvent(new Event(PLAY_LIVE_EVENT)) : navigate('/play/live'));
  const { league, schedule } = save;
  const regularDone = schedule.every((g) => g.seriesId !== undefined || g.played);

  let primary: Primary;
  if (league.phase === 'offseason') {
    primary = { label: 'Offseason', run: () => navigate('/play/offseason'), menu: false };
  } else if (league.phase === 'playoffs' && league.playoffs?.championId != null) {
    primary = {
      label: 'Offseason',
      run: () => void act(() => api().advance()).then((err) => !err && navigate('/play/offseason')),
      menu: false,
    };
  } else if (league.phase === 'playoffs') {
    primary = { label: 'Play', run: playLive, menu: true };
  } else if (regularDone) {
    primary = { label: 'Playoffs', run: () => void simulate('next'), menu: false };
  } else {
    primary = { label: league.phase === 'preseason' ? 'Play ball' : 'Play', run: playLive, menu: true };
  }
  const options = league.phase === 'playoffs' ? PLAYOFF_OPTIONS : SEASON_OPTIONS;

  return (
    <>
      <div className="flex h-10 overflow-hidden rounded-full bg-accent text-accent-contrast">
        <button onClick={primary.run} disabled={running} className={`flex items-center gap-1.5 pl-4 text-sm font-semibold disabled:opacity-50 ${primary.menu ? 'pr-3' : 'pr-4'}`}>
          <Icon name="play" className="size-4" /> {primary.label}
        </button>
        {primary.menu && (
          <button
            onClick={() => setMenu(true)}
            disabled={running}
            className="grid grid-cols-1 w-9 place-items-center border-l border-accent-contrast/20 disabled:opacity-50"
            aria-label="More sim options"
          >
            <Icon name="chevron" className="size-4 rotate-90" />
          </button>
        )}
      </div>
      <BottomSheet open={menu} onClose={() => setMenu(false)} title="Simulate">
        <h2 className="mb-1 text-xl font-bold">Simulate</h2>
        <p className="mb-4 text-sm text-muted">Today is {formatDate(league.date)}. Play opens the next game for you to manage; these let your staff handle it.</p>
        <ul className="flex flex-col gap-2">
          {options.map((o) => (
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
            {sim.mode !== 'playoffs' && <span className="tabular-nums">{pct}%</span>}
          </div>
          <div className="h-1.5 rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${sim.mode === 'playoffs' ? 100 : pct}%` }} />
          </div>
        </div>
        <button onClick={stop} className="h-8 rounded-full border border-line px-3 text-xs font-semibold hover:bg-surface-2">Stop</button>
      </div>
    </div>
  );
}
