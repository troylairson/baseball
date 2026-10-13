import { Link } from 'react-router-dom';
import { contractStatus } from '../../engine';
import { useSave, useUserTeam } from '../../state/game';
import { Card, PageHeader, SoonBadge } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { fullName, money } from '../format';
import { useOpenPlayer } from '../hooks';
import { scoutedOverall } from '../scouting';
import { payroll, payrollBudget, spending } from '../teams';
import { BudgetBar } from '../components/BudgetBar';
import { FinancesCard } from '../components/FinancesCard';

const STATUS_LABEL = { 'pre-arb': 'Pre-arb', arbitration: 'Arb', 'free-agent': 'FA' } as const;

const TOOLS: { icon: IconName; title: string; detail: string; to?: string }[] = [
  { icon: 'trade', title: 'Trades', detail: 'Build deals with clear value feedback', to: '/play/trades' },
  { icon: 'pen', title: 'Free Agents', detail: 'Sign available players', to: '/play/free-agents' },
  { icon: 'draft', title: 'Draft', detail: 'Held each offseason', to: '/play/offseason' },
  { icon: 'staff', title: 'Staff & Scouting', detail: 'Coaches, trainer and scouting budget', to: '/play/staff' },
];

export function FrontOffice() {
  const { players, league } = useSave();
  const team = useUserTeam();
  const openPlayer = useOpenPlayer();
  const pay = payroll(players, team.id);
  const spend = spending(league, players, team);
  const budget = payrollBudget(team);
  const contracts = players
    .filter((p) => p.teamId === team.id && p.level === 'MLB')
    .sort((a, b) => (b.contract?.salary ?? 0) - (a.contract?.salary ?? 0));

  return (
    <>
      <PageHeader title="Front Office" subtitle="Run the business of baseball" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Finances">
          <BudgetBar used={spend} budget={budget} label="Total spending" />
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Player payroll</dt><dd className="tabular-nums">{money(pay)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Staff & scouting</dt><dd className="tabular-nums">{money(spend - pay)}</dd></div>
          </dl>
        </Card>

        <FinancesCard team={team} />

        <Card title="Tools">
          <ul className="-mx-2">
            {TOOLS.map((t) => {
              const enabled = t.to && (t.title !== 'Draft' || league.offseason === 'draft');
              const body = (
                <>
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${enabled ? 'bg-accent/12 text-accent' : 'bg-surface-2 text-muted'}`}>
                    <Icon name={t.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{t.title}</span>
                    <span className="block text-sm text-muted">{t.detail}</span>
                  </span>
                  {enabled ? <Icon name="chevron" className="size-4 text-muted" /> : <SoonBadge />}
                </>
              );
              return (
                <li key={t.title}>
                  {enabled ? (
                    <Link to={t.to!} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">{body}</Link>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl px-2 py-2">{body}</div>
                  )}
                </li>
              );
            })}
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
                  <th className="pb-2 text-right font-medium">Status</th>
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
                    <td className="text-right text-xs text-muted">{STATUS_LABEL[contractStatus(p)]}</td>
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
