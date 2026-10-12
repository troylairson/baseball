import { isPitcher, type Player } from '../../engine';
import { money, fullName } from '../format';
import { scouted, scoutedOverall } from '../scouting';
import { RatingBadge } from './Rating';

/** Compact, tappable player row used in rosters and lists. */
export function PlayerCard({
  player, userTeamId, onOpen, statLine,
}: { player: Player; userTeamId: number; onOpen: (id: number) => void; statLine?: string | null }) {
  const { ovr, pot } = scoutedOverall(player, userTeamId);
  const keys = isPitcher(player)
    ? [['STF', player.pitching!.stuff], ['CTL', player.pitching!.control], ['MOV', player.pitching!.movement]] as const
    : [['CON', player.batting.contact], ['POW', player.batting.power], ['EYE', player.batting.eye]] as const;

  return (
    <button
      onClick={() => onOpen(player.id)}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-2"
    >
      <span className="w-8 shrink-0 text-center text-xs font-bold text-muted">{player.position}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{fullName(player)}</span>
        <span className="block truncate text-xs text-muted tabular-nums">
          {statLine ?? `Age ${player.age} · ${player.bats}/${player.throws} · ${money(player.contract?.salary ?? 0)}`}
        </span>
      </span>
      <span className="hidden gap-1.5 sm:flex">
        {keys.map(([label, v]) => (
          <RatingBadge key={label} label={label} size="sm" value={scouted(player, label, v, userTeamId).value} />
        ))}
      </span>
      <span className="flex gap-1.5">
        <RatingBadge value={ovr} label="OVR" />
        <RatingBadge value={pot} label="POT" />
      </span>
    </button>
  );
}
