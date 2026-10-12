import { useSave, useUserTeam } from '../../state/game';
import { Card, PageHeader, SoonBadge } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { fullName, money } from '../format';
import { useOpenPlayer } from '../hooks';
import { scoutedOverall } from '../scouting';
import { payroll, payrollBudget } from '../teams';

const TOOLS: { icon: IconName; title: string; detail: string }[] = [
  { icon: 'trade', title: 'Trades', detail: 'Build deals with clear value feedback' },
  { icon: 'pen', title: 'Free Agency', detail: 'Bid against the league for talent' },
  { icon: 'draft', title: 'Draft', detail: 'Scout and pick amateur prospects' },
  { icon: 'search', title: 'Scouting', detail: 'Budgets, directors and assignments' },
  { icon: 'staff', title: 'Staff', detail: 'Coaches who shape development' },
];

export function FrontOffice() {
  const { players } = useSave();
  const team = useUserTeam();
  const openPlayer = useOpenPlayer();
  const pay = payroll(players, team.id);
  const budget = payrollBudget(team);
  const used = Math.min(100, (pay / budget) * 100);
  const contracts = players
    .filter((p) => p.teamId === team.id && p.level === 'MLB')
    .sort((a, b) => (b.contract?.salary ?? 0) - (a.contract?.salary ?? 0));

  return (
    <>
      <PageHeader title="Front Office" subtitle="Run the business of baseball" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Finances">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tabular-nums">{money(pay)}</span>
            <span className="text-sm text-muted">of {money(budget)} budget</span>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-surface-2">
            <div className={`h-full rounded-full ${pay > budget ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${used}%` }} />
          </div>
          <p className="mt-2 text-sm text-muted">
            {pay > budget ? `${money(pay - budget)} over budget` : `${money(budget - pay)} available to spend`}
          </p>
        </Card>

        <Card title="Tools">
          <ul className="-mx-2">
            {TOOLS.map((t) => (
              <li key={t.title} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                  <Icon name={t.icon} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t.title}</span>
                  <span className="block text-sm text-muted">{t.detail}</span>
                </span>
                <SoonBadge />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Contracts" className="md:col-span-2">
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm tabular-nums">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="sticky left-0 bg-surface px-4 pb-2 text-left font-medium">Player</th>
                  <th className="pb-2 text-left font-medium">Pos</th>
                  <th className="pb-2 text-right font-medium">Age</th>
                  <th className="pb-2 text-right font-medium">OVR</th>
                  <th className="pb-2 text-right font-medium">Salary</th>
                  <th className="px-4 pb-2 text-right font-medium">Yrs</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="sticky left-0 bg-surface px-4 py-2">
                      <button onClick={() => openPlayer(p.id)} className="font-medium hover:underline">{fullName(p)}</button>
                    </td>
                    <td className="text-muted">{p.position}</td>
                    <td className="text-right">{p.age}</td>
                    <td className="text-right">{scoutedOverall(p, team.id).ovr}</td>
                    <td className="text-right">{money(p.contract?.salary ?? 0)}</td>
                    <td className={`px-4 text-right ${p.contract?.years === 1 ? 'font-semibold text-danger' : ''}`}>{p.contract?.years}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
