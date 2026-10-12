import { contractDemand, overall, type Player } from '../../engine';
import { api, useGame } from '../../state/game';
import { money } from '../format';
import { payroll, payrollBudget } from '../teams';

/** Context-aware buttons for a player: roster moves, contracts, signing, drafting. */
export function PlayerActions({ player }: { player: Player }) {
  const save = useGame((s) => s.save)!;
  const act = useGame((s) => s.act);
  const { league, meta } = save;
  const userTeamId = meta.userTeamId;
  const team = save.teams.find((t) => t.id === userTeamId)!;
  const mine = player.teamId === userTeamId;
  const btn = 'h-11 flex-1 rounded-xl text-sm font-semibold';
  const primary = `${btn} bg-accent text-accent-contrast`;
  const secondary = `${btn} border border-line hover:bg-surface-2`;
  const room = payrollBudget(team) - payroll(save.players, userTeamId);

  if (player.retired) return <Note>Retired.</Note>;

  if (player.draftProspect) {
    const pick = league.draft?.picks[league.draft.current];
    const onClock = league.offseason === 'draft' && pick?.teamId === userTeamId;
    return onClock ? (
      <div className="flex gap-2">
        <button className={primary} onClick={() => void act(() => api().draft(player.id))}>Draft with pick #{pick!.overall}</button>
      </div>
    ) : (
      <Note>Draft prospect. {league.offseason === 'draft' ? "You're not on the clock." : ''}</Note>
    );
  }

  if (player.teamId === null) {
    const demand = player.demand ?? contractDemand(player);
    const over = demand.salary > room;
    return (
      <div>
        <p className="mb-2 text-sm text-muted">
          Free agent asking <strong className="text-ink">{money(demand.salary)}</strong> × {demand.years} yr{demand.years > 1 ? 's' : ''}.
          {over && <span className="text-danger"> This would put you {money(demand.salary - room)} over budget.</span>}
        </p>
        <button className={`${primary} w-full`} onClick={() => void act(() => api().signFreeAgent(player.id))}>
          Sign for {money(demand.salary)} / {demand.years} yr{demand.years > 1 ? 's' : ''}
        </button>
      </div>
    );
  }

  if (!mine) return null;

  if (league.offseason === 'resign' && player.contract?.years === 0) {
    const demand = player.demand ?? contractDemand(player);
    return (
      <div>
        <p className="mb-2 text-sm text-muted">Contract expired. Asking {money(demand.salary)} × {demand.years} yr{demand.years > 1 ? 's' : ''}.</p>
        <div className="flex gap-2">
          <button className={primary} onClick={() => void act(() => api().resign(player.id))}>Re-sign</button>
          <button className={secondary} onClick={() => void act(() => api().letGo(player.id))}>Let go</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {player.level === 'MLB' ? (
        <button className={secondary} onClick={() => void act(() => api().setLevel(player.id, 'AAA'))}>Send to AAA</button>
      ) : (
        <button className={primary} onClick={() => void act(() => api().setLevel(player.id, 'MLB'))}>
          Call up{overall(player) < 40 ? ' (not ready)' : ''}
        </button>
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">{children}</p>;
}
