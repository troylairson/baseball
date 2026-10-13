import { nextBudget, projectedAttendance, STADIUM_CAPACITY, TICKET_LEVELS, totalRevenue, type Team } from '../../engine';
import { api, useGame, useSave } from '../../state/game';
import { money } from '../format';
import { Card } from './Card';
import { Segmented } from './Segmented';

/** Fans, tickets and revenue for the user's club. */
export function FinancesCard({ team }: { team: Team }) {
  const save = useSave();
  const act = useGame((s) => s.act);
  const f = team.finances?.season === save.league.season ? team.finances : undefined;
  const last = team.lastFinances;
  const interest = team.fanInterest ?? 50;
  const avgAttendance = f && f.homeGames ? Math.round(f.attendance / f.homeGames) : projectedAttendance(team);
  const rows: [string, number][] = f ? [['Tickets', f.tickets], ['Playoff gates', f.playoffs], ['Media', f.media], ['Merchandise', f.merch]] : [];

  return (
    <Card title="Fans & revenue">
      <div className="mb-1 flex justify-between text-sm"><span className="text-muted">Fan interest</span><strong className="tabular-nums">{interest}</strong></div>
      <div className="h-2 rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${interest}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">Winning, star players and fair prices build interest.</p>

      <p className="mb-1 mt-4 text-sm font-medium">Ticket prices</p>
      <Segmented
        label="Ticket prices"
        value={String(team.ticketPrice ?? 2)}
        onChange={(v) => void act(() => api().setTicketPrice(Number(v)))}
        options={TICKET_LEVELS.map((l, i) => ({ value: String(i), label: l.label }))}
      />
      <p className="mt-1 text-xs text-muted">
        {f?.homeGames ? 'Averaging' : 'Projected'} {avgAttendance.toLocaleString()} fans ({Math.round((avgAttendance / STADIUM_CAPACITY) * 100)}% full). Higher prices earn more per fan but draw fewer and cool interest.
      </p>

      <dl className="mt-4 space-y-1 text-sm">
        {rows.filter(([, v]) => v > 0).map(([label, v]) => (
          <div key={label} className="flex justify-between"><dt className="text-muted">{label}</dt><dd className="tabular-nums">{money(v)}</dd></div>
        ))}
        {f && (
          <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>{save.league.season} revenue so far</dt><dd className="tabular-nums">{money(totalRevenue(f))}</dd></div>
        )}
        {last && (
          <div className="flex justify-between text-muted"><dt>{last.season} total revenue</dt><dd className="tabular-nums">{money(totalRevenue(last))}</dd></div>
        )}
      </dl>
      {last && <p className="mt-2 text-xs text-muted">Revenue shapes next year's budget (currently projected around {money(nextBudget(team))}).</p>}
      {!last && <p className="mt-2 text-xs text-muted">Media and merchandise money is booked at season's end, and together with ticket sales sets next year's budget.</p>}
    </Card>
  );
}
