import { useMemo, useState } from 'react';
import { evaluateTrade, isPitcher, teamMode, tradeWindowOpen, type Player, type Team } from '../../engine';
import { api, useGame, useSave, useUserTeam } from '../../state/game';
import { BottomSheet } from '../components/BottomSheet';
import { Card, PageHeader } from '../components/Card';
import { Icon } from '../components/Icon';
import { RatingBadge } from '../components/Rating';
import { TeamBadge } from '../components/TeamBadge';
import { byPosition, fullName, money } from '../format';
import { useOpenPlayer } from '../hooks';
import { scoutedOverall } from '../scouting';
import { teamOverall } from '../teams';

export function Trades() {
  const save = useSave();
  const team = useUserTeam();
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const tradeWindow = tradeWindowOpen(save.league);
  const ctx = { league: save.league, teams: save.teams, players: save.players, userTeamId: team.id };

  if (partnerId === null) {
    return (
      <>
        <PageHeader title="Trades" subtitle="Pick a trading partner" />
        {!tradeWindow.open && <p className="mb-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">{tradeWindow.reason}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {save.teams.filter((t) => t.id !== team.id).map((t) => {
            const mode = teamMode(ctx, t.id);
            return (
              <button key={t.id} onClick={() => setPartnerId(t.id)} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left hover:border-muted">
                <TeamBadge team={t} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{t.city} {t.name}</span>
                  <span className="block text-xs text-muted">
                    {t.wins}–{t.losses} · <span className={mode === 'contending' ? 'text-accent' : ''}>{mode === 'contending' ? 'Contending' : 'Rebuilding'}</span>
                  </span>
                </span>
                <RatingBadge value={teamOverall(save.players, t.id)} size="sm" />
              </button>
            );
          })}
        </div>
      </>
    );
  }
  return <TradeBuilder partner={save.teams.find((t) => t.id === partnerId)!} onBack={() => setPartnerId(null)} />;
}

function TradeBuilder({ partner, onBack }: { partner: Team; onBack: () => void }) {
  const save = useSave();
  const team = useUserTeam();
  const act = useGame((s) => s.act);
  const showToast = useGame((s) => s.showToast);
  const openPlayer = useOpenPlayer();
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const [picking, setPicking] = useState<'give' | 'get' | null>(null);
  const byId = useMemo(() => new Map(save.players.map((p) => [p.id, p])), [save.players]);
  const ctx = { league: save.league, teams: save.teams, players: save.players, userTeamId: team.id };
  const evaluation = evaluateTrade(ctx, { partnerId: partner.id, give, get });

  const propose = async () => {
    const err = await act(() => api().trade({ partnerId: partner.id, give, get }));
    if (!err) {
      showToast(`Trade completed with ${partner.city}.`);
      setGive([]);
      setGet([]);
    }
  };

  const side = (title: string, ids: number[], set: (ids: number[]) => void, which: 'give' | 'get') => (
    <Card title={title} action={<button onClick={() => setPicking(which)} className="text-sm font-semibold text-accent">+ Add</button>} className="px-2 sm:px-4">
      {ids.length === 0 ? (
        <button onClick={() => setPicking(which)} className="w-full rounded-xl border border-dashed border-line px-3 py-6 text-sm text-muted">Add players</button>
      ) : (
        <ul>
          {ids.map((id) => {
            const p = byId.get(id)!;
            const { ovr, pot } = scoutedOverall(p, team.id);
            return (
              <li key={id} className="flex items-center gap-2 border-t border-line py-2 first:border-t-0">
                <button onClick={() => openPlayer(id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="w-7 text-center text-xs font-bold text-muted">{p.position}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{fullName(p)}</span>
                    <span className="block text-xs text-muted">Age {p.age} · {money(p.contract?.salary ?? 0)} × {p.contract?.years ?? 0}</span>
                  </span>
                  <RatingBadge value={ovr} size="sm" />
                  <RatingBadge value={pot} size="sm" />
                </button>
                <button onClick={() => set(ids.filter((x) => x !== id))} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2" aria-label={`Remove ${fullName(p)}`}>
                  <Icon name="close" className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );

  const pct = Math.min(100, Math.round(evaluation.score * 100));
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <button onClick={onBack} className="grid size-10 place-items-center rounded-full hover:bg-surface-2" aria-label="Back to teams">
          <Icon name="back" />
        </button>
        <TeamBadge team={partner} size="sm" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">Trade with {partner.city}</h1>
          <p className="text-xs text-muted">{evaluation.partnerMode === 'contending' ? 'Contending — values current ability' : 'Rebuilding — values youth and upside'}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {side('You give', give, setGive, 'give')}
        {side('You get', get, setGet, 'get')}
      </div>
      <div className="pb-safe sticky bottom-20 z-20 mt-4 rounded-2xl border border-line bg-surface p-4 shadow-lg md:bottom-4">
        <div className="mb-1 flex justify-between text-xs text-muted"><span>Their interest</span><span>{evaluation.accepted ? 'Deal!' : `${pct}%`}</span></div>
        <div className="h-2 rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${evaluation.accepted ? 'bg-accent' : pct >= 85 ? 'bg-amber-400' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm">{evaluation.message}</p>
        <button
          onClick={() => void propose()}
          disabled={!evaluation.accepted}
          className="mt-3 h-12 w-full rounded-xl bg-accent font-semibold text-accent-contrast disabled:opacity-40"
        >
          Make the trade
        </button>
      </div>

      <PickPlayers
        open={picking !== null}
        title={picking === 'give' ? 'Your players' : `${partner.city} players`}
        players={save.players.filter((p) => p.teamId === (picking === 'give' ? team.id : partner.id) && !p.retired)}
        selected={picking === 'give' ? give : get}
        userTeamId={team.id}
        onChange={(ids) => (picking === 'give' ? setGive(ids) : setGet(ids))}
        onClose={() => setPicking(null)}
      />
    </>
  );
}

function PickPlayers({
  open, title, players, selected, userTeamId, onChange, onClose,
}: { open: boolean; title: string; players: Player[]; selected: number[]; userTeamId: number; onChange: (ids: number[]) => void; onClose: () => void }) {
  const [filter, setFilter] = useState<'MLB' | 'AAA'>('MLB');
  const list = players.filter((p) => p.level === filter).sort((a, b) => Number(isPitcher(a)) - Number(isPitcher(b)) || byPosition(a, b));
  const toggle = (id: number) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <h2 className="mb-3 pr-10 text-xl font-bold">{title}</h2>
      <div className="mb-3 flex gap-2">
        {(['MLB', 'AAA'] as const).map((l) => (
          <button key={l} onClick={() => setFilter(l)} className={`h-9 rounded-full px-4 text-sm font-medium ${filter === l ? 'bg-ink text-bg' : 'bg-surface-2 text-muted'}`}>{l}</button>
        ))}
      </div>
      <ul className="-mx-2">
        {list.map((p) => {
          const { ovr, pot } = scoutedOverall(p, userTeamId);
          const on = selected.includes(p.id);
          return (
            <li key={p.id}>
              <button onClick={() => toggle(p.id)} aria-pressed={on} className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left ${on ? 'bg-accent/10' : 'hover:bg-surface-2'}`}>
                <span className={`grid size-6 shrink-0 place-items-center rounded-md border ${on ? 'border-accent bg-accent text-accent-contrast' : 'border-line'}`}>
                  {on && <Icon name="check" className="size-4" />}
                </span>
                <span className="w-7 text-center text-xs font-bold text-muted">{p.position}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{fullName(p)}</span>
                  <span className="block text-xs text-muted">Age {p.age} · {money(p.contract?.salary ?? 0)}</span>
                </span>
                <RatingBadge value={ovr} size="sm" />
                <RatingBadge value={pot} size="sm" />
              </button>
            </li>
          );
        })}
      </ul>
      <button onClick={onClose} className="mt-4 h-12 w-full rounded-xl bg-accent font-semibold text-accent-contrast">Done ({selected.length})</button>
    </BottomSheet>
  );
}
