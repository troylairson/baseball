import { Link } from 'react-router-dom';
import {
  contractDemand, contractStatus, expectedWar, extensionTerms, extensionWillingness, EXTENSION_THRESHOLD, headedToFreeAgency,
  marketSalary, refusesToResign, roleOf, yearsOfControl, type Contract, type Player,
} from '../../engine';
import { api, useGame, useSave, useUserTeam } from '../../state/game';
import { Card, PageHeader } from '../components/Card';
import { RatingBadge } from '../components/Rating';
import { fullName, money } from '../format';
import { useOpenPlayer } from '../hooks';
import { scoutedOverall } from '../scouting';
import { statSummary, useStatsMap } from '../stats';
import { payrollBudget, spending } from '../teams';

type Verdict = { label: string; tone: string; why: string };

/** The assistant's read on a price: what the market would pay him against what he wants. */
function verdict(p: Player, ask: Contract): Verdict {
  const worth = marketSalary(expectedWar(p), roleOf(p));
  const ratio = ask.salary / Math.max(1, worth);
  const aging = p.age >= 32 && ask.years >= 3;
  if (ratio <= 0.85 && !aging) return { label: 'Bargain', tone: 'bg-accent/15 text-accent', why: `He'd cost about ${money(worth)} a year on the open market.` };
  if (ratio <= 1.15 && !aging) return { label: 'Fair price', tone: 'bg-surface-2 text-ink', why: `Close to the ${money(worth)} a year he'd get elsewhere.` };
  if (aging) return { label: 'Risky', tone: 'bg-amber-400/20 text-amber-700 dark:text-amber-300', why: `${ask.years} years takes him to ${p.age + ask.years}; most players decline in their mid-thirties.` };
  return { label: 'Overpay', tone: 'bg-danger/15 text-danger', why: `More than the ${money(worth)} a year he'd likely get on the open market.` };
}

/**
 * Everyone who could leave after this season, in one place: how they're
 * playing, what they want, whether they'll talk, and the assistant's read.
 * In the offseason's re-sign stage, the same list makes the final calls.
 */
export function Contracts() {
  const save = useSave();
  const team = useUserTeam();
  const act = useGame((s) => s.act);
  const openPlayer = useOpenPlayer();
  const stats = useStatsMap();
  const { league } = save;
  const resigning = league.offseason === 'resign';
  const org = save.players.filter((p) => p.teamId === team.id && !p.retired);
  const games = team.wins + team.losses;
  const winPct = games ? team.wins / games : 0.5;

  // In season: deals that run out this year (free agents to be, plus arbitration players worth locking up early).
  const leaving = org.filter((p) => p.level === 'MLB' && headedToFreeAgency(p));
  const extendEarly = org.filter((p) => p.level === 'MLB' && !headedToFreeAgency(p) && contractStatus(p) === 'arbitration'
    && p.contract?.years === 1 && scoutedOverall(p, team.id).ovr >= 55);
  // Offseason: contracts that have run out and need an answer now.
  const decide = org.filter((p) => p.contract?.years === 0);

  const pay = spending(league, save.players, team);
  const budget = payrollBudget(team);
  const value = (p: Player) => scoutedOverall(p, team.id).ovr;
  const byValue = (a: Player, b: Player) => value(b) - value(a);

  const row = (p: Player) => {
    const offseason = resigning && p.contract?.years === 0;
    const arb = offseason ? p.expiring === 'arbitration' : false;
    const ask = offseason ? p.demand ?? contractDemand(p) : extensionTerms(p);
    const willing = offseason ? !refusesToResign(p) : extensionWillingness(p, winPct) >= EXTENSION_THRESHOLD;
    const v = verdict(p, ask);
    const line = statSummary(p, stats.get(p.id));
    const raise = ask.salary - (p.contract?.salary ?? 0);
    return (
      <li key={p.id} className="py-3">
        <div className="flex items-start gap-3">
          <button onClick={() => openPlayer(p.id)} className="min-w-0 flex-1 text-left">
            <span className="block truncate font-semibold">{fullName(p)} <span className="text-xs font-normal text-muted">{p.position} · {p.age}</span></span>
            <span className="block truncate text-xs text-muted">{line ?? 'No stats yet this season'}</span>
            <span className="block text-xs text-muted">Now {money(p.contract?.salary ?? 0)}{offseason ? '' : ` · ${yearsOfControl(p)} yr left`}</span>
          </button>
          <RatingBadge value={value(p)} size="sm" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`rounded px-1.5 py-0.5 font-bold uppercase ${v.tone}`}>{v.label}</span>
          <span className={`rounded px-1.5 py-0.5 font-semibold ${willing ? 'bg-accent/10 text-accent' : 'bg-danger/10 text-danger'}`}>
            {willing ? (offseason ? 'Will re-sign' : 'Open to an extension') : offseason ? "Won't re-sign: unhappy" : 'Wants to test free agency'}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          {arb ? 'Arbitration: ' : 'Asks '}{money(ask.salary)} × {ask.years} yr{ask.years > 1 ? 's' : ''}
          {raise > 0 ? ` (+${money(raise)} a year)` : ''}. {v.why}
        </p>
        <div className="mt-2 flex gap-2">
          {offseason ? (
            <>
              <button disabled={!willing} onClick={() => void act(() => api().resign(p.id))} className="h-9 flex-1 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-contrast disabled:opacity-40">
                {arb ? 'Tender' : 'Re-sign'} {money(ask.salary)}
              </button>
              <button onClick={() => void act(() => api().letGo(p.id))} className="h-9 flex-1 rounded-lg border border-line px-3 text-sm font-semibold">
                {arb ? 'Non-tender' : 'Let him go'}
              </button>
            </>
          ) : (
            <button disabled={!willing} onClick={() => void act(() => api().extend(p.id))} className="h-9 flex-1 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-contrast disabled:opacity-40">
              Extend: {money(ask.salary)} × {ask.years} yr{ask.years > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </li>
    );
  };

  const empty = resigning ? decide.length === 0 : leaving.length + extendEarly.length === 0;
  return (
    <>
      <PageHeader title="Contract decisions" subtitle={resigning ? 'Re-sign or let go before free agency opens' : `${league.season} · players whose deals run out this year`} />
      <Card>
        <p className="text-sm">
          Spending {money(pay)} of your {money(budget)} budget{pay > budget ? <span className="text-danger"> (over)</span> : ''}.
          {' '}Extensions add their raise to next year's payroll.
        </p>
      </Card>

      {empty && (
        <Card className="mt-4">
          <p className="text-sm text-muted">{resigning ? 'Nothing left to decide. Continue to free agency from the Offseason screen.' : 'Nobody on your roster can leave after this season.'}</p>
        </Card>
      )}
      {resigning && decide.length > 0 && (
        <Card title={`Decide now (${decide.length})`} className="mt-4">
          <ul className="divide-y divide-line">{[...decide].sort(byValue).map(row)}</ul>
        </Card>
      )}
      {!resigning && leaving.length > 0 && (
        <Card title={`Can leave as free agents (${leaving.length})`} className="mt-4">
          <ul className="divide-y divide-line">{[...leaving].sort(byValue).map(row)}</ul>
        </Card>
      )}
      {!resigning && extendEarly.length > 0 && (
        <Card title="Lock up early (arbitration)" className="mt-4">
          <p className="text-xs text-muted">Under team control for now, but each arbitration raise gets bigger. An extension buys out those years.</p>
          <ul className="divide-y divide-line">{[...extendEarly].sort(byValue).map(row)}</ul>
        </Card>
      )}
      {resigning && (
        <Link to="/play/offseason" className="mt-4 flex h-11 items-center justify-center rounded-xl border border-line text-sm font-semibold hover:bg-surface-2">Back to the offseason</Link>
      )}
    </>
  );
}
