import { useState } from 'react';
import {
  contractDemand, MARKET_ROUNDS, offerOutlook, type Interest, type MarketOffer, type Player, type SeasonState,
} from '../../engine';
import { api, useGame, useSave, useUserTeam } from '../../state/game';
import { BottomSheet } from '../components/BottomSheet';
import { Card } from '../components/Card';
import { fullName, money } from '../format';
import { payrollBudget, spending } from '../teams';

const OUTLOOK: Record<Interest, { label: string; tone: string }> = {
  likely: { label: 'Likely to sign', tone: 'bg-accent/15 text-accent' },
  competitive: { label: 'Competitive', tone: 'bg-amber-400/20 text-amber-700 dark:text-amber-300' },
  unlikely: { label: 'Unlikely', tone: 'bg-danger/15 text-danger' },
};

/** Engine view of the snapshot, for read-only helpers. */
function stateOf(save: ReturnType<typeof useSave>): SeasonState {
  return { league: save.league, teams: save.teams, players: save.players } as unknown as SeasonState;
}

export function OutlookChip({ outlook }: { outlook: Interest }) {
  const o = OUTLOOK[outlook];
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${o.tone}`}>{o.label}</span>;
}

/** Round status, your standing offers, and the button that ends the round. */
export function MarketPanel({ onOffer }: { onOffer: (p: Player) => void }) {
  const save = useSave();
  const team = useUserTeam();
  const act = useGame((s) => s.act);
  const [busy, setBusy] = useState(false);
  const market = save.league.market!;
  const byId = new Map(save.players.map((p) => [p.id, p]));
  const offers = market.offers.filter((o) => byId.get(o.playerId)?.teamId === null);
  const committed = offers.reduce((s, o) => s + o.salary, 0);
  const done = market.round > MARKET_ROUNDS;

  const endRound = async () => {
    setBusy(true);
    await act(() => api().marketRound());
    setBusy(false);
  };

  return (
    <Card title={done ? 'Free agency' : `Free agency · round ${market.round} of ${MARKET_ROUNDS}`}>
      <p className="text-sm text-muted">
        {done
          ? 'The market has closed. Unsigned players will take one-year deals in spring. Continue to the draft.'
          : 'Make offers, then end the round. Clubs bid at the same time, and each player signs with the best offer that meets his price. Prices drop the longer a player goes unsigned.'}
      </p>
      {offers.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {offers.map((o) => {
            const p = byId.get(o.playerId)!;
            return (
              <li key={o.playerId} className="flex items-center gap-2 py-2">
                <button onClick={() => onOffer(p)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium">{fullName(p)} <span className="text-xs text-muted">{p.position}</span></span>
                  <span className="block text-xs text-muted">Your offer: {money(o.salary)} × {o.years} yr{o.years > 1 ? 's' : ''}</span>
                </button>
                <OutlookChip outlook={offerOutlook(stateOf(save), o)} />
              </li>
            );
          })}
        </ul>
      )}
      {offers.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          If all sign: {money(spending(save.league, save.players, team) + committed)} of your {money(payrollBudget(team))} budget.
        </p>
      )}
      {!done && (
        <button onClick={() => void endRound()} disabled={busy} className="mt-3 h-11 w-full rounded-xl bg-accent text-sm font-semibold text-accent-contrast disabled:opacity-60">
          {busy ? 'Clubs are bidding…' : `End round ${market.round}`}
        </button>
      )}
    </Card>
  );
}

const STEP = 250;

/** Make or change an offer: salary and years, with a live read on how it stacks up. */
export function OfferSheet({ player, onClose }: { player: Player | null; onClose: () => void }) {
  return (
    <BottomSheet open={!!player} onClose={onClose} title={player ? `Offer ${fullName(player)}` : 'Offer'}>
      {player && <OfferForm key={player.id} player={player} onClose={onClose} />}
    </BottomSheet>
  );
}

function OfferForm({ player, onClose }: { player: Player; onClose: () => void }) {
  const save = useSave();
  const team = useUserTeam();
  const act = useGame((s) => s.act);
  const market = save.league.market!;
  const existing = market.offers.find((o) => o.playerId === player.id);
  const ask = player.demand ?? contractDemand(player);
  const [salary, setSalary] = useState(existing?.salary ?? ask.salary);
  const [years, setYears] = useState(existing?.years ?? ask.years);
  const offer: MarketOffer = { playerId: player.id, teamId: team.id, salary, years };
  const outlook = offerOutlook(stateOf(save), offer);
  const interest = market.interest[player.id] ?? 0;
  const otherOffers = market.offers.filter((o) => o.playerId !== player.id && save.players.find((p) => p.id === o.playerId)?.teamId === null);
  const after = spending(save.league, save.players, team) + otherOffers.reduce((s, o) => s + o.salary, 0) + salary;
  const budget = payrollBudget(team);

  const submit = async () => {
    const err = await act(() => api().marketOffer({ playerId: player.id, salary, years }));
    if (!err) onClose();
  };
  const withdraw = async () => {
    const err = await act(() => api().marketWithdraw(player.id));
    if (!err) onClose();
  };

  return (
    <div>
      <h2 className="pr-10 text-xl font-bold">{fullName(player)}</h2>
      <p className="text-sm text-muted">
        {player.position} · Age {player.age} · asks {money(ask.salary)} × {ask.years} yr{ask.years > 1 ? 's' : ''}
      </p>
      <p className="mt-1 text-sm">
        {interest ? `${interest} other club${interest > 1 ? 's' : ''} bid on him last round.` : market.round > 1 ? 'No other bids last round.' : 'Clubs make their first bids when this round ends.'}
      </p>

      <div className="mt-4">
        <label className="flex items-center justify-between text-sm font-medium" htmlFor="offer-salary">
          Salary per season <strong className="tabular-nums">{money(salary)}</strong>
        </label>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => setSalary(Math.max(760, salary - STEP * 2))} className="size-10 rounded-lg border border-line text-lg font-bold" aria-label="Lower salary">−</button>
          <input
            id="offer-salary"
            type="range"
            min={760}
            max={Math.max(ask.salary * 2, 5000)}
            step={STEP}
            value={salary}
            onChange={(e) => setSalary(Number(e.target.value))}
            className="h-10 min-w-0 flex-1 accent-[var(--accent)]"
          />
          <button onClick={() => setSalary(salary + STEP * 2)} className="size-10 rounded-lg border border-line text-lg font-bold" aria-label="Raise salary">+</button>
        </div>
      </div>

      <div className="mt-4">
        <label className="text-sm font-medium" htmlFor="offer-years">Years</label>
        <select
          id="offer-years"
          value={years}
          onChange={(e) => setYears(Number(e.target.value))}
          className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm"
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map((y) => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}{y === ask.years ? ' (what he wants)' : ''}</option>)}
        </select>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
        <span>Total {money(salary * years)}</span>
        <OutlookChip outlook={outlook} />
      </div>
      <p className={`mt-2 text-xs ${after > budget ? 'text-danger' : 'text-muted'}`}>
        With your other offers, spending would be {money(after)} of your {money(budget)} budget{after > budget ? ' (over budget: the owner will notice)' : ''}.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2">
        <button onClick={() => void submit()} className="h-12 rounded-xl bg-accent font-semibold text-accent-contrast">
          {existing ? 'Update offer' : 'Make offer'}
        </button>
        {existing && (
          <button onClick={() => void withdraw()} className="h-11 rounded-xl border border-line text-sm font-semibold text-danger">Withdraw offer</button>
        )}
      </div>
    </div>
  );
}
