import { useState } from 'react';
import { battingOverall, FIELD_POSITIONS, isPitcher, type FieldPosition, type LineupSlot } from '../../../engine';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { RatingBadge } from '../../components/Rating';
import { fullName } from '../../format';
import { useOpenPlayer } from '../../hooks';
import { scouted } from '../../scouting';
import { statSummary, useStatsMap } from '../../stats';
import { ChoosePlayerSheet } from './ChoosePlayerSheet';
import { StrategyCard } from './StrategyCard';
import { clonePlan, usePlan } from './usePlan';

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

export function LineupEditor({ userTeamId, useDH }: { userTeamId: number; useDH: boolean }) {
  const { plan, active, byId, custom, save, reset } = usePlan();
  const stats = useStatsMap();
  const openPlayer = useOpenPlayer();
  const [choosing, setChoosing] = useState<number | null>(null);
  const lineup = plan.lineup.filter((s) => s.position !== 'P');
  const inLineup = new Set(lineup.map((s) => s.playerId));
  const bench = active.filter((p) => !isPitcher(p) && !inLineup.has(p.id));
  const positions: LineupSlot['position'][] = [...FIELD_POSITIONS, ...(useDH ? (['DH'] as const) : [])];

  const bat = (id: number) => {
    const p = byId.get(id)!;
    return scouted(p, 'bat-ovr', Math.round(battingOverall(p.batting)), userTeamId).value;
  };

  const update = (fn: (l: LineupSlot[]) => void) => {
    const next = clonePlan(plan);
    next.lineup = next.lineup.filter((s) => s.position !== 'P');
    fn(next.lineup);
    void save(next);
  };

  const move = (i: number, dir: -1 | 1) =>
    update((l) => {
      const j = i + dir;
      if (j < 0 || j >= l.length) return;
      [l[i], l[j]] = [l[j]!, l[i]!];
    });

  const setPosition = (i: number, pos: LineupSlot['position']) =>
    update((l) => {
      const other = l.findIndex((s) => s.position === pos);
      if (other >= 0) l[other]!.position = l[i]!.position;
      l[i]!.position = pos;
    });

  const replace = (i: number, playerId: number) =>
    update((l) => {
      const other = l.findIndex((s) => s.playerId === playerId);
      if (other >= 0) {
        // Swap batting slots, keep each slot's position.
        const a = l[i]!.playerId;
        l[i]!.playerId = playerId;
        l[other]!.playerId = a;
      } else {
        l[i]!.playerId = playerId;
      }
    });

  const fitNote = (id: number, pos: string) => {
    const p = byId.get(id)!;
    if (pos === 'DH') return '';
    return p.positionRatings[pos as FieldPosition] !== undefined ? '' : ' · out of position';
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{custom ? 'Your lineup is used every game.' : 'The AI sets the lineup each game.'}</p>
        {custom ? (
          <button onClick={() => void reset()} className="h-9 shrink-0 rounded-full border border-line px-4 text-sm font-medium hover:bg-surface-2">Use auto</button>
        ) : (
          <button onClick={() => void save(clonePlan(plan))} className="h-9 shrink-0 rounded-full bg-accent px-4 text-sm font-semibold text-accent-contrast">Customize</button>
        )}
      </div>
      <Card title="Batting order" className="px-2 sm:px-4">
        <ol>
          {lineup.map((slot, i) => {
            const p = byId.get(slot.playerId)!;
            return (
              <li key={slot.playerId} className="flex items-center gap-2 border-t border-line py-2 first:border-t-0">
                <span className="w-7 text-center text-xs font-semibold text-muted tabular-nums">{ORDINAL[i]}</span>
                <select
                  aria-label={`Position for ${fullName(p)}`}
                  value={slot.position}
                  onChange={(e) => setPosition(i, e.target.value as LineupSlot['position'])}
                  className="h-9 w-14 shrink-0 rounded-lg border border-line bg-surface-2 px-1 text-center text-xs font-bold"
                >
                  {positions.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
                </select>
                <button onClick={() => setChoosing(i)} className="min-w-0 flex-1 rounded-lg px-1 py-1 text-left hover:bg-surface-2">
                  <span className="block truncate font-medium">{fullName(p)}</span>
                  <span className="block truncate text-xs text-muted">
                    {statSummary(p, stats.get(p.id)) ?? `Age ${p.age} · bats ${p.bats}`}{fitNote(p.id, slot.position)}
                  </span>
                </button>
                <RatingBadge value={bat(p.id)} size="sm" />
                <span className="flex flex-col">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="grid grid-cols-1 h-5 w-8 place-items-center text-muted disabled:opacity-20">
                    <Icon name="chevron" className="size-4 -rotate-90" />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === lineup.length - 1} aria-label="Move down" className="grid grid-cols-1 h-5 w-8 place-items-center text-muted disabled:opacity-20">
                    <Icon name="chevron" className="size-4 rotate-90" />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      </Card>
      <Card title={`Bench (${bench.length})`} className="mt-4 px-2 sm:px-4">
        {bench.length === 0 ? (
          <p className="px-2 text-sm text-muted">No position players on the bench.</p>
        ) : (
          <ul>
            {bench.map((p) => (
              <li key={p.id}>
                <button onClick={() => openPlayer(p.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
                  <span className="w-8 text-center text-xs font-bold text-muted">{p.position}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{fullName(p)}</span>
                  <RatingBadge value={bat(p.id)} size="sm" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-center text-xs text-muted">Badges show batting value. Tap a name to swap in another player.</p>
      <StrategyCard />

      <ChoosePlayerSheet
        open={choosing !== null}
        title={choosing !== null ? `Batting ${ORDINAL[choosing]}` : ''}
        onClose={() => setChoosing(null)}
        onPick={(id) => choosing !== null && replace(choosing, id)}
        rows={active
          .filter((p) => !isPitcher(p))
          .sort((a, b) => bat(b.id) - bat(a.id))
          .map((p) => {
            const idx = lineup.findIndex((s) => s.playerId === p.id);
            return {
              player: p,
              note: idx >= 0 ? `Batting ${ORDINAL[idx]} (${lineup[idx]!.position})` : 'Bench',
              rating: bat(p.id),
              detail: Object.keys(p.positionRatings).join('/') || 'DH',
            };
          })}
      />
    </>
  );
}
