import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { detectTrends, type Trend, type TrendAction } from '../../engine';
import { api, useGame, useSave } from '../../state/game';
import { useOpenPlayer } from '../hooks';
import { Card } from './Card';
import { Icon } from './Icon';

const SHOWN = 4;

/** What's going on with the team lately, and what you might do about it. */
export function TrendsCard({ className = '' }: { className?: string }) {
  const save = useSave();
  const [all, setAll] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const trends = useMemo(
    () => detectTrends({
      league: save.league, teams: save.teams, players: save.players, schedule: save.schedule,
      stats: new Map(save.stats.map((s) => [s.playerId, s])), userTeamId: save.meta.userTeamId, seed: save.meta.seed,
    }),
    [save],
  );
  // A day of games produces a new save; forget which suggestions were taken.
  const [seenDate, setSeenDate] = useState(save.league.date);
  if (seenDate !== save.league.date) {
    setSeenDate(save.league.date);
    setDone(new Set());
  }
  if (trends.length === 0) return null;
  const shown = all ? trends : trends.slice(0, SHOWN);
  return (
    <Card
      title="Trends"
      className={className}
      action={<span className="text-xs text-muted">{trends.filter((t) => t.tone === 'bad').length} to watch</span>}
    >
      <ul className="-mx-1 grid grid-cols-1 md:grid-cols-2 md:gap-x-6">
        {shown.map((t) => (
          <TrendRow key={t.id} trend={t} done={done} onDone={(key) => setDone(new Set(done).add(key))} />
        ))}
      </ul>
      {trends.length > SHOWN && (
        <button onClick={() => setAll(!all)} className="mt-2 h-9 w-full rounded-lg text-sm font-medium text-accent hover:bg-surface-2">
          {all ? 'Show fewer' : `Show all ${trends.length}`}
        </button>
      )}
    </Card>
  );
}

function TrendRow({ trend: t, done, onDone }: { trend: Trend; done: Set<string>; onDone: (key: string) => void }) {
  const act = useGame((s) => s.act);
  const navigate = useNavigate();
  const openPlayer = useOpenPlayer();
  const run = async (action: TrendAction, key: string) => {
    if (action.kind === 'goto') return navigate(action.path);
    const err = await act(() => api().applyTrend(action));
    if (!err) onDone(key);
  };
  const tone = t.tone === 'bad' ? 'bg-danger/12 text-danger' : t.tone === 'good' ? 'bg-accent/12 text-accent' : 'bg-surface-2 text-muted';
  const title = <span className="block font-medium">{t.title}</span>;
  return (
    <li className="flex gap-3 border-t border-line px-1 py-3 first:border-t-0 md:nth-2:border-t-0">
      <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${tone}`}>
        <Icon name={t.tone === 'bad' ? 'down' : t.tone === 'good' ? 'up' : 'alert'} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        {t.playerId !== undefined ? (
          <button onClick={() => openPlayer(t.playerId!)} className="text-left hover:underline">{title}</button>
        ) : title}
        <p className="text-sm">{t.detail}</p>
        {t.context && <p className="text-sm text-muted">{t.context}</p>}
        {t.suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {t.suggestions.map((s, i) => {
              const key = `${t.id}:${i}`;
              if (!s.action) return <span key={key} className="flex h-8 items-center text-xs text-muted italic">{s.label}</span>;
              const taken = done.has(key);
              return (
                <button
                  key={key}
                  disabled={taken}
                  onClick={() => void run(s.action!, key)}
                  className="flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-xs font-semibold hover:bg-surface-2 disabled:opacity-60"
                >
                  {taken && <Icon name="check" className="size-3.5" />}
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
}
