import { money } from '../format';

export function BudgetBar({ used, budget, label = 'Payroll' }: { used: number; budget: number; label?: string }) {
  const pct = Math.min(100, (used / budget) * 100);
  const over = used > budget;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">
          <strong>{money(used)}</strong> <span className="text-muted">/ {money(budget)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-1 text-xs ${over ? 'text-danger' : 'text-muted'}`}>
        {over ? `${money(used - budget)} over budget — the owner will notice.` : `${money(budget - used)} available`}
      </p>
    </div>
  );
}
