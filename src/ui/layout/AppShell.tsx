import { useCallback, useState } from 'react';
import { NavLink, Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { useGame, useUserTeam } from '../../state/game';
import { Icon } from '../components/Icon';
import { TeamBadge } from '../components/TeamBadge';
import { formatDate } from '../format';
import { PlayerSheet } from '../screens/PlayerSheet';
import { SettingsSheet } from '../screens/SettingsSheet';
import { NAV_ITEMS } from './nav';
import { Toast } from '../components/Toast';
import { SimButton, SimProgressBar } from './SimControls';
import { BoxScoreSheet } from '../screens/BoxScoreSheet';

export function AppShell() {
  const save = useGame((s) => s.save);
  if (!save) return <Navigate to="/" replace />;
  return <Shell />;
}

function Shell() {
  const [params, setParams] = useSearchParams();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const playerId = Number(params.get('p')) || null;
  const gameId = Number(params.get('g')) || null;
  const closeParam = useCallback((key: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(key);
      return next;
    });
  }, [setParams]);
  const closePlayer = useCallback(() => closeParam('p'), [closeParam]);
  const closeGame = useCallback(() => closeParam('g'), [closeParam]);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <Sidebar onSettings={() => setSettingsOpen(true)} />
      <div className="flex min-w-0 flex-col">
        <TopBar onSettings={() => setSettingsOpen(true)} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-6">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <BoxScoreSheet gameId={gameId} onClose={closeGame} />
      <PlayerSheet playerId={playerId} onClose={closePlayer} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toast />
    </div>
  );
}

function TopBar({ onSettings }: { onSettings: () => void }) {
  const team = useUserTeam();
  const league = useGame((s) => s.save!.league);
  const seasonDone = useGame((s) => s.save!.schedule.every((g) => g.seriesId !== undefined || g.played));
  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 md:px-8">
        <TeamBadge team={team} size="sm" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold">
            {team.name} <span className="font-normal text-muted tabular-nums">· {team.wins}–{team.losses}</span>
          </div>
          <div className="truncate text-xs text-muted">{formatDate(league.date)} · {phaseLabel(league.phase, seasonDone)}</div>
        </div>
        <button onClick={onSettings} className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2 md:hidden" aria-label="Settings">
          <Icon name="settings" />
        </button>
        <SimButton />
      </div>
      <SimProgressBar />
    </header>
  );
}

function phaseLabel(phase: string, seasonDone: boolean): string {
  if (phase === 'regular' && seasonDone) return 'Regular season complete';
  return { preseason: 'Preseason', regular: 'Season', playoffs: 'Playoffs', offseason: 'Offseason' }[phase] ?? phase;
}

function Sidebar({ onSettings }: { onSettings: () => void }) {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-3 py-5 md:flex">
      <div className="mb-6 flex items-center gap-2 px-3">
        <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-contrast">◆</span>
        <span className="text-lg font-bold tracking-tight">Diamond GM</span>
      </div>
      <nav className="flex flex-col gap-1" aria-label="Main">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                isActive ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink'
              }`
            }
          >
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <button onClick={onSettings} className="mt-auto flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink">
        <Icon name="settings" /> Settings
      </button>
    </aside>
  );
}

function BottomNav() {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-md md:hidden" aria-label="Main">
      <div className="grid grid-cols-5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? 'text-accent' : 'text-muted'}`
            }
          >
            <Icon name={item.icon} className="size-6" />
            {item.label === 'Front Office' ? 'Office' : item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
