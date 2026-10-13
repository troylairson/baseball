import { clubhouseRole, moraleFactors, moraleLabel, type Player } from '../../engine';
import { useSave } from '../../state/game';

const TONE = {
  Happy: 'bg-accent/15 text-accent',
  Content: 'bg-surface-2 text-muted',
  Unhappy: 'bg-amber-400/20 text-amber-700 dark:text-amber-300',
  Miserable: 'bg-danger/15 text-danger',
} as const;

export function MoraleChip({ morale }: { morale: number | undefined }) {
  const label = moraleLabel(morale);
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${TONE[label]}`}>{label}</span>;
}

/** Morale with the reasons behind it, for the player sheet. */
export function MoraleSummary({ player }: { player: Player }) {
  const save = useSave();
  const factors = moraleFactors(player, { teams: save.teams, players: save.players, stats: new Map(save.stats.map((s) => [s.playerId, s])) });
  if (player.teamId === null) return null;
  return (
    <div className="mt-3 rounded-xl border border-line px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">Morale</span>
        <MoraleChip morale={player.morale} />
        {player.tradeRequested && <span className="text-xs font-semibold text-danger">Trade requested</span>}
        {clubhouseRole(player) === 'leader' && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-accent">Clubhouse leader</span>}
        {clubhouseRole(player) === 'bad-apple' && <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-danger">Troublemaker</span>}
      </div>
      {factors.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-muted">
          {factors.map((f) => (
            <li key={f.label}><span className={f.value > 0 ? 'text-accent' : 'text-danger'}>{f.value > 0 ? '▲' : '▼'}</span> {f.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
