import type { ReactNode } from 'react';
import type { Player } from '../../../engine';
import { BottomSheet } from '../../components/BottomSheet';
import { RatingBadge } from '../../components/Rating';
import { fullName } from '../../format';

export interface ChoiceRow {
  player: Player;
  /** Where the player currently is ("Bench", "Batting 3rd", "SP2"...). */
  note: string;
  rating: number;
  detail?: ReactNode;
}

export function ChoosePlayerSheet({
  open, title, rows, onPick, onClose,
}: { open: boolean; title: string; rows: ChoiceRow[]; onPick: (id: number) => void; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <h2 className="mb-3 pr-10 text-xl font-bold">{title}</h2>
      <ul className="-mx-2">
        {rows.map(({ player, note, rating, detail }) => (
          <li key={player.id}>
            <button
              onClick={() => {
                onPick(player.id);
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2"
            >
              <span className="w-8 text-center text-xs font-bold text-muted">{player.position}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{fullName(player)}</span>
                <span className="block truncate text-xs text-muted">{note}{detail ? <> · {detail}</> : null}</span>
              </span>
              <RatingBadge value={rating} size="sm" />
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
