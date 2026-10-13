import { isPitcher, type Player } from '../../engine';
import { api, useGame, useSave, useUserTeam } from '../../state/game';

/** Sit one of your hitters against left- or right-handed starters. */
export function PlatoonControl({ player }: { player: Player }) {
  const save = useSave();
  const team = useUserTeam();
  const act = useGame((s) => s.act);
  if (player.teamId !== save.meta.userTeamId || isPitcher(player) || player.level !== 'MLB') return null;
  const sitsVs = team.platoon?.L.includes(player.id) ? 'L' : team.platoon?.R.includes(player.id) ? 'R' : null;
  const set = (hand: 'L' | 'R' | null) =>
    void act(() => api().applyTrend(hand ? { kind: 'platoon', playerId: player.id, hand } : { kind: 'unplatoon', playerId: player.id }));
  const options = [
    { value: null, label: 'Every day' },
    { value: 'L' as const, label: 'Sit vs LHP' },
    { value: 'R' as const, label: 'Sit vs RHP' },
  ];
  return (
    <div className="mt-3 rounded-xl border border-line px-3 py-2">
      <p className="text-sm font-medium">Platoon</p>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5" role="group" aria-label="Platoon">
        {options.map((o) => (
          <button
            key={o.label}
            aria-pressed={sitsVs === o.value}
            onClick={() => set(o.value)}
            className={`h-9 rounded-lg text-xs font-semibold ${sitsVs === o.value ? 'bg-accent text-accent-contrast' : 'border border-line hover:bg-surface-2'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {sitsVs ? `The best bench bat at his position starts when the other team throws a ${sitsVs === 'L' ? 'lefty' : 'righty'}.` : 'Plays regardless of the opposing starter.'}
      </p>
    </div>
  );
}
