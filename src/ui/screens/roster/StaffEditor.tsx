import { useState } from 'react';
import { isPitcher, pitchingOverall, type GamePlan } from '../../../engine';
import { Card } from '../../components/Card';
import { RatingBadge } from '../../components/Rating';
import { fullName } from '../../format';
import { scouted } from '../../scouting';
import { statSummary, useStatsMap } from '../../stats';
import { ChoosePlayerSheet } from './ChoosePlayerSheet';
import { clonePlan, usePlan } from './usePlan';

type Slot = { kind: 'rotation' | 'setup' | 'middle'; index: number } | { kind: 'closer' };

const label = (s: Slot) =>
  s.kind === 'rotation' ? `Starter ${s.index + 1}` : s.kind === 'closer' ? 'Closer' : s.kind === 'setup' ? `Setup ${s.index + 1}` : 'Bullpen';

function get(plan: GamePlan, s: Slot): number | null {
  if (s.kind === 'closer') return plan.closer;
  return plan[s.kind][s.index] ?? null;
}

function put(plan: GamePlan, s: Slot, id: number | null) {
  if (s.kind === 'closer') plan.closer = id;
  else if (id === null) plan[s.kind].splice(s.index, 1);
  else plan[s.kind][s.index] = id;
}

function find(plan: GamePlan, id: number): Slot | null {
  if (plan.closer === id) return { kind: 'closer' };
  for (const kind of ['rotation', 'setup', 'middle'] as const) {
    const index = plan[kind].indexOf(id);
    if (index >= 0) return { kind, index };
  }
  return null;
}

export function StaffEditor({ userTeamId }: { userTeamId: number }) {
  const { plan, active, byId, custom, save, reset } = usePlan();
  const stats = useStatsMap();
  const [choosing, setChoosing] = useState<Slot | null>(null);

  const rating = (id: number, starter: boolean) => {
    const p = byId.get(id)!;
    return scouted(p, starter ? 'sp-ovr' : 'rp-ovr', Math.round(pitchingOverall(p.pitching!, starter)), userTeamId).value;
  };

  const assign = (slot: Slot, id: number) => {
    const next = clonePlan(plan);
    const from = find(next, id);
    const occupant = get(next, slot);
    put(next, slot, id);
    if (from) put(next, from, occupant);
    next.middle = next.middle.filter((x) => x !== null);
    void save(next);
  };

  const row = (slot: Slot) => {
    const id = get(plan, slot);
    const p = id !== null ? byId.get(id) : undefined;
    const starter = slot.kind === 'rotation';
    return (
      <li key={`${slot.kind}-${'index' in slot ? slot.index : 0}`} className="border-t border-line first:border-t-0">
        <button onClick={() => setChoosing(slot)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2">
          <span className="w-16 shrink-0 text-xs font-semibold text-muted">{label(slot)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{p ? fullName(p) : 'Empty'}</span>
            {p && <span className="block truncate text-xs text-muted">{statSummary(p, stats.get(p.id)) ?? `Age ${p.age} · throws ${p.throws}`}</span>}
          </span>
          {p && <RatingBadge value={rating(p.id, starter)} size="sm" />}
        </button>
      </li>
    );
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{custom ? 'Your staff roles are used every game.' : 'The AI sets the staff each game.'}</p>
        {custom ? (
          <button onClick={() => void reset()} className="h-9 shrink-0 rounded-full border border-line px-4 text-sm font-medium hover:bg-surface-2">Use auto</button>
        ) : (
          <button onClick={() => void save(clonePlan(plan))} className="h-9 shrink-0 rounded-full bg-accent px-4 text-sm font-semibold text-accent-contrast">Customize</button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Rotation" className="px-2 sm:px-4">
          <ul>{plan.rotation.map((_, index) => row({ kind: 'rotation', index }))}</ul>
        </Card>
        <Card title="Late innings" className="px-2 sm:px-4">
          <ul>
            {row({ kind: 'closer' })}
            {[0, 1].map((index) => row({ kind: 'setup', index }))}
          </ul>
        </Card>
        <Card title="Bullpen" className="px-2 sm:px-4 md:col-span-2">
          <ul>{plan.middle.map((_, index) => row({ kind: 'middle', index }))}</ul>
        </Card>
      </div>

      <ChoosePlayerSheet
        open={choosing !== null}
        title={choosing ? label(choosing) : ''}
        onClose={() => setChoosing(null)}
        onPick={(id) => choosing && assign(choosing, id)}
        rows={active
          .filter(isPitcher)
          .map((p) => {
            const at = find(plan, p.id);
            const starter = choosing?.kind === 'rotation';
            return { player: p, note: at ? label(at) : 'Unassigned', rating: rating(p.id, starter) };
          })
          .sort((a, b) => b.rating - a.rating)}
      />
    </>
  );
}
