import { useState } from 'react';
import { withDefaults, type Decision, type DecisionKind, type LiveOrders } from '../../engine';
import { api, useGame, useSave } from '../../state/game';
import { BottomSheet } from './BottomSheet';

const KIND_LABEL: Record<DecisionKind, string> = {
  pitching: 'Pitching', pinchHit: 'Pinch hit', steal: 'Baserunning', bunt: 'Bunt', walk: 'Intentional walk', bigMoment: 'Big spot',
};

/** The moment the game stopped for, with the assistant's call and a way to play on. */
export function DecisionCard({
  decision, skipped, busy, onAccept, onKeepGoing,
}: { decision: Decision; skipped?: number; busy: boolean; onAccept: () => void; onKeepGoing: () => void }) {
  return (
    <div className="mb-2 rounded-xl border border-accent/40 bg-accent/10 p-3" role="status" aria-live="polite">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
        {KIND_LABEL[decision.kind]}{skipped ? ` · played ${skipped} batter${skipped === 1 ? '' : 's'} to get here` : ''}
      </p>
      <p className="mt-0.5 font-semibold">{decision.title}</p>
      <p className="text-sm text-muted">{decision.detail}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {decision.suggestion ? (
          <button onClick={onAccept} disabled={busy} className="h-10 rounded-lg bg-accent px-2 text-sm font-semibold text-accent-contrast disabled:opacity-60">
            {decision.suggestion.label} <kbd className="ml-1 hidden rounded bg-black/15 px-1 text-[10px] md:inline">Enter</kbd>
          </button>
        ) : <span />}
        <button onClick={onKeepGoing} disabled={busy} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm font-semibold disabled:opacity-60">
          Keep going <kbd className="ml-1 hidden rounded bg-surface-2 px-1 text-[10px] text-muted md:inline">Space</kbd>
        </button>
      </div>
    </div>
  );
}

const STOP_LABELS: [DecisionKind, string][] = [
  ['pitching', 'Your pitcher tires, struggles, or a save spot comes up'],
  ['pinchHit', 'A bench bat has a clear edge (late, close games)'],
  ['steal', 'A runner has good odds to steal'],
  ['bunt', 'A bunt makes sense (late, close, nobody out)'],
  ['walk', 'Walking a dangerous hitter makes sense'],
  ['bigMoment', 'Big spots late in close games'],
];

/** Standing orders for live games: what the assistant does by itself, and when it stops to ask. */
export function OrdersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Standing orders">
      {open && <OrdersForm onClose={onClose} />}
    </BottomSheet>
  );
}

function OrdersForm({ onClose }: { onClose: () => void }) {
  const save = useSave();
  const act = useGame((s) => s.act);
  const [o, setO] = useState<LiveOrders>(() => withDefaults(save.league.liveOrders));
  const select = 'h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm';
  const submit = async () => {
    const err = await act(() => api().setLiveOrders(o));
    if (!err) onClose();
  };
  return (
    <div>
      <h2 className="pr-10 text-xl font-bold">Standing orders</h2>
      <p className="text-sm text-muted">Your assistant carries these out by itself, so the game only stops for real decisions.</p>

      <div className="mt-4 grid gap-3">
        <label className="text-sm font-medium">
          Send runners automatically
          <select className={`${select} mt-1`} value={o.stealSpeed ?? 'off'} onChange={(e) => setO({ ...o, stealSpeed: e.target.value === 'off' ? null : Number(e.target.value) })}>
            <option value="off">Never: I'll decide</option>
            {[60, 65, 70, 75, 80].map((v) => <option key={v} value={v}>Speed {v}+ (third base: {v + 10}+)</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          Pull the starter at
          <select className={`${select} mt-1`} value={o.starterPitchLimit ?? 'staff'} onChange={(e) => setO({ ...o, starterPitchLimit: e.target.value === 'staff' ? null : Number(e.target.value) })}>
            <option value="staff">When the pitching coach says (stamina)</option>
            {[70, 80, 90, 95, 100, 105, 110, 120].map((v) => <option key={v} value={v}>{v} pitches</option>)}
          </select>
        </label>
        <Toggle checked={o.closerInSave} onChange={(v) => setO({ ...o, closerInSave: v })} label="Closer starts the 9th with a 1–3 run lead" />
        <Toggle checked={o.pinchHitForPitcher} onChange={(v) => setO({ ...o, pinchHitForPitcher: v })} label="Pinch-hit for the pitcher from the 6th in close games (no DH)" />
      </div>

      <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-muted">Stop and ask me when…</h3>
      <div className="mt-2 grid gap-2">
        {STOP_LABELS.map(([kind, label]) => (
          <Toggle key={kind} checked={o.stops[kind]} onChange={(v) => setO({ ...o, stops: { ...o.stops, [kind]: v } })} label={label} />
        ))}
      </div>

      <button onClick={() => void submit()} className="mt-5 h-12 w-full rounded-xl bg-accent font-semibold text-accent-contrast">Save orders</button>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
