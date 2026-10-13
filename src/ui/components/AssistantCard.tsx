import { useMemo } from 'react';
import { assistantAdvice, type Advice } from '../../engine';
import { api, useGame, useSave } from '../../state/game';
import { Card } from './Card';
import { Icon } from './Icon';

const ACTION_LABEL: Record<NonNullable<Advice['action']>['kind'], string> = { swap: 'Make the move', sign: 'Sign him', extend: 'Offer extension' };

export function AssistantCard() {
  const save = useSave();
  const act = useGame((s) => s.act);
  const advice = useMemo(
    () => assistantAdvice({
      league: save.league, teams: save.teams, players: save.players, schedule: save.schedule,
      stats: new Map(save.stats.map((s) => [s.playerId, s])), userTeamId: save.meta.userTeamId, seed: save.meta.seed,
    }),
    [save],
  );
  if (advice.length === 0) return null;
  return (
    <Card title="Assistant GM">
      <ul className="space-y-3">
        {advice.map((a) => (
          <li key={a.id} className="flex gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent"><Icon name="staff" className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{a.title}</p>
              <p className="text-sm text-muted">{a.body}</p>
              {a.action && (
                <button onClick={() => void act(() => api().applyAdvice(a.action!))} className="mt-2 h-9 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-surface-2">
                  {ACTION_LABEL[a.action.kind]}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
