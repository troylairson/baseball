import { useMemo } from 'react';
import { resolvePlan, type GamePlan, type Player } from '../../../engine';
import { api, useGame, useSave, useUserTeam } from '../../../state/game';

/** The user team's effective plan plus a saver. */
export function usePlan() {
  const save = useSave();
  const team = useUserTeam();
  const act = useGame((s) => s.act);
  const active = useMemo(
    () => save.players.filter((p) => p.teamId === team.id && p.level === 'MLB' && !p.retired),
    [save.players, team.id],
  );
  const plan = useMemo(
    () => resolvePlan(active, team.plan, save.league.settings.designatedHitter),
    [active, team.plan, save.league.settings.designatedHitter],
  );
  const byId = useMemo(() => new Map(active.map((p) => [p.id, p])), [active]);
  return {
    plan,
    active,
    byId: byId as Map<number, Player>,
    custom: !!team.plan,
    save: (next: GamePlan) => act(() => api().setPlan(next)),
    reset: () => act(() => api().setPlan(null)),
  };
}

export const clonePlan = (p: GamePlan): GamePlan => ({
  lineup: p.lineup.map((s) => ({ ...s })),
  rotation: [...p.rotation],
  closer: p.closer,
  setup: [...p.setup],
  middle: [...p.middle],
});
