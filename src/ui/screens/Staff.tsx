import { useState } from 'react';
import {
  ROLE_EFFECT, ROLE_LABEL, SCOUTING_LEVELS, scoutingAccuracy, staffCost, staffOf, STAFF_ROLES, type StaffRole,
} from '../../engine';
import { api, useGame, useSave, useUserTeam } from '../../state/game';
import { BottomSheet } from '../components/BottomSheet';
import { BudgetBar } from '../components/BudgetBar';
import { Card, PageHeader } from '../components/Card';
import { RatingBadge } from '../components/Rating';
import { Segmented } from '../components/Segmented';
import { money } from '../format';
import { payroll, payrollBudget } from '../teams';

const confidence = (acc: number) => `±${Math.round((1 - acc) * 15)}`;

export function Staff() {
  const save = useSave();
  const team = useUserTeam();
  const act = useGame((s) => s.act);
  const [hiring, setHiring] = useState<StaffRole | null>(null);
  const { league } = save;
  const acc = scoutingAccuracy(league, team);
  const level = team.scoutingLevel ?? 1;
  const pool = hiring ? (league.staff ?? []).filter((s) => s.teamId === null && s.role === hiring).sort((a, b) => b.rating - a.rating) : [];

  return (
    <>
      <PageHeader title="Staff & Scouting" subtitle="The people behind the roster" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Spending">
          <BudgetBar used={payroll(save.players, team.id) + staffCost(league, team)} budget={payrollBudget(team)} label="Payroll + staff + scouting" />
          <p className="mt-2 text-xs text-muted">Staff & scouting: {money(staffCost(league, team))} per season.</p>
        </Card>
        <Card title="Scouting budget">
          <Segmented
            label="Scouting budget"
            value={String(level)}
            onChange={(v) => void act(() => api().setScoutingLevel(Number(v)))}
            options={SCOUTING_LEVELS.map((l, i) => ({ value: String(i), label: `${l.label} ${money(l.cost)}` }))}
          />
          <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-surface-2 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-muted">Your players</dt>
              <dd className="font-semibold tabular-nums">{confidence(acc.own)}</dd>
            </div>
            <div className="rounded-xl bg-surface-2 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-muted">Everyone else</dt>
              <dd className="font-semibold tabular-nums">{confidence(acc.other)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted">Typical rating error. Spending more — and a better director — sharpens reports on trade targets, free agents and draft prospects.</p>
        </Card>
        {STAFF_ROLES.map((role) => {
          const s = staffOf(league, team.id, role);
          return (
            <Card key={role} title={ROLE_LABEL[role]} action={<button onClick={() => setHiring(role)} className="text-sm font-semibold text-accent">Replace</button>}>
              {s ? (
                <div className="flex items-center gap-3">
                  <RatingBadge value={s.rating} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="text-xs text-muted">Age {s.age} · {money(s.salary)}/yr</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">Vacant</p>
              )}
              <p className="mt-2 text-xs text-muted">{ROLE_EFFECT[role]}.</p>
            </Card>
          );
        })}
      </div>

      <BottomSheet open={hiring !== null} onClose={() => setHiring(null)} title="Hire">
        {hiring && (
          <>
            <h2 className="mb-1 pr-10 text-xl font-bold">Hire a {ROLE_LABEL[hiring].toLowerCase()}</h2>
            <p className="mb-3 text-sm text-muted">Your current {ROLE_LABEL[hiring].toLowerCase()} returns to the market.</p>
            <ul className="-mx-2">
              {pool.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      setHiring(null);
                      void act(() => api().hireStaff(s.id));
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2"
                  >
                    <RatingBadge value={s.rating} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="block text-xs text-muted">Age {s.age}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{money(s.salary)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </BottomSheet>
    </>
  );
}
