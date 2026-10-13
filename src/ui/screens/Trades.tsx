import { useMemo, useState } from 'react';
import {
  evaluateTrade, isPitcher, parsePickId, pickId, pickLabel, pickOwner, picksOwnedBy, shopPlayer, suggestPackage, teamMode, tradeWindowOpen,
  type Player, type Team,
} from '../../engine';
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
  const [seed, setSeed] = useState<{ give: number[]; get: number[] }>({ give: [], get: [] });
  const tradeWindow = tradeWindowOpen(save.league);
  const ctx = { league: save.league, teams: save.teams, players: save.players, userTeamId: team.id };

  if (partnerId === null) {
    return (
      <>
        <PageHeader title="Trades" subtitle="Pick a trading partner" />
        {!tradeWindow.open && <p className="mb-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">{tradeWindow.reason}</p>}
        <Offers />
        {tradeWindow.open && (
          <ShopPlayer
            onPick={(id, give, get) => {
              setSeed({ give, get });
              setPartnerId(id);
            }}
          />
        )}
        <h2 className="mb-2 mt-2 px-1 text-sm font-semibold uppercase tracking-wide text-muted">Teams</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {save.teams.filter((t) => t.id !== team.id).map((t) => {
            const mode = teamMode(ctx, t.id);
            return (
              <button key={t.id} onClick={() => { setSeed({ give: [], get: [] }); setPartnerId(t.id); }} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left hover:border-muted">
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
  return <TradeBuilder key={partnerId} partner={save.teams.find((t) => t.id === partnerId)!} initial={seed} onBack={() => setPartnerId(null)} />;
}

function TradeBuilder({ partner, initial, onBack }: { partner: Team; initial: { give: number[]; get: number[] }; onBack: () => void }) {
  const save = useSave();
  const team = useUserTeam();
  const act = useGame((s) => s.act);
  const showToast = useGame((s) => s.showToast);
  const openPlayer = useOpenPlayer();
  const [give, setGive] = useState<number[]>(initial.give);
  const [get, setGet] = useState<number[]>(initial.get);
  const [givePicks, setGivePicks] = useState<string[]>([]);
  const [getPicks, setGetPicks] = useState<string[]>([]);
  const [picking, setPicking] = useState<'give' | 'get' | null>(null);
  const byId = useMemo(() => new Map(save.players.map((p) => [p.id, p])), [save.players]);
  const ctx = { league: save.league, teams: save.teams, players: save.players, userTeamId: team.id };
  const proposal = { partnerId: partner.id, give, get, givePicks, getPicks };
  const evaluation = evaluateTrade(ctx, proposal);

  const findDeal = () => {
    const pkg = suggestPackage(ctx, partner.id, get);
    if (pkg) setGive(pkg);
    else showToast("Nothing you have gets this done.");
  };

  const propose = async () => {
    const err = await act(() => api().trade(proposal));
    if (!err) {
      showToast(`Trade completed with ${partner.city}.`);
      setGive([]);
      setGet([]);
      setGivePicks([]);
      setGetPicks([]);
    }
  };

  const side = (title: string, ids: number[], set: (ids: number[]) => void, which: 'give' | 'get', picks: string[], setPicks: (ids: string[]) => void) => (
    <Card title={title} action={<button onClick={() => setPicking(which)} className="text-sm font-semibold text-accent">+ Add</button>} className="px-2 sm:px-4">
      {ids.length + picks.length === 0 ? (
        <button onClick={() => setPicking(which)} className="w-full rounded-xl border border-dashed border-line px-3 py-6 text-sm text-muted">Add players or picks</button>
      ) : (
        <ul>
          {picks.map((id) => (
            <li key={id} className="flex items-center gap-2 border-t border-line py-2 first:border-t-0">
              <span className="grid w-7 place-items-center text-muted"><Icon name="draft" className="size-4" /></span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{pickLabel(save.teams, parsePickId(id), pickOwner(save.league, id))}</span>
              <button onClick={() => setPicks(picks.filter((x) => x !== id))} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2" aria-label="Remove pick">
                <Icon name="close" className="size-4" />
              </button>
            </li>
          ))}
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
        {side('You give', give, setGive, 'give', givePicks, setGivePicks)}
        {side('You get', get, setGet, 'get', getPicks, setGetPicks)}
      </div>
      <div className="pb-safe sticky bottom-20 z-20 mt-4 rounded-2xl border border-line bg-surface p-4 shadow-lg md:bottom-4">
        <div className="mb-1 flex justify-between text-xs text-muted"><span>Their interest</span><span>{evaluation.accepted ? 'Deal!' : `${pct}%`}</span></div>
        <div className="h-2 rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${evaluation.accepted ? 'bg-accent' : pct >= 85 ? 'bg-amber-400' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm">{evaluation.message}</p>
        {get.length > 0 && !evaluation.accepted && (
          <button onClick={findDeal} className="mt-2 text-sm font-semibold text-accent">Find me a package</button>
        )}
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
        picks={picking ? picksOwnedBy(save.league, save.teams, picking === 'give' ? team.id : partner.id).map(pickId) : []}
        selectedPicks={picking === 'give' ? givePicks : getPicks}
        onPicks={(ids) => (picking === 'give' ? setGivePicks(ids) : setGetPicks(ids))}
        onClose={() => setPicking(null)}
      />
    </>
  );
}

function PickPlayers({
  open, title, players, selected, userTeamId, onChange, onClose, picks, selectedPicks, onPicks,
}: {
  open: boolean; title: string; players: Player[]; selected: number[]; userTeamId: number; onChange: (ids: number[]) => void; onClose: () => void;
  picks: string[]; selectedPicks: string[]; onPicks: (ids: string[]) => void;
}) {
  const save = useSave();
  const [filter, setFilter] = useState<'MLB' | 'AAA' | 'Picks'>('MLB');
  const list = filter === 'Picks' ? [] : players.filter((p) => p.level === filter).sort((a, b) => Number(isPitcher(a)) - Number(isPitcher(b)) || byPosition(a, b));
  const togglePick = (id: string) => onPicks(selectedPicks.includes(id) ? selectedPicks.filter((x) => x !== id) : [...selectedPicks, id]);
  const toggle = (id: number) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <h2 className="mb-3 pr-10 text-xl font-bold">{title}</h2>
      <div className="mb-3 flex gap-2">
        {(['MLB', 'AAA', 'Picks'] as const).map((l) => (
          <button key={l} onClick={() => setFilter(l)} className={`h-9 rounded-full px-4 text-sm font-medium ${filter === l ? 'bg-ink text-bg' : 'bg-surface-2 text-muted'}`}>{l}</button>
        ))}
      </div>
      {filter === 'Picks' && (
        picks.length === 0 ? <p className="text-sm text-muted">No picks available to trade right now.</p> : (
          <ul className="-mx-2">
            {picks.map((id) => {
              const on = selectedPicks.includes(id);
              return (
                <li key={id}>
                  <button onClick={() => togglePick(id)} aria-pressed={on} className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left ${on ? 'bg-accent/10' : 'hover:bg-surface-2'}`}>
                    <span className={`grid size-6 shrink-0 place-items-center rounded-md border ${on ? 'border-accent bg-accent text-accent-contrast' : 'border-line'}`}>
                      {on && <Icon name="check" className="size-4" />}
                    </span>
                    <span className="flex-1 text-sm font-medium">{pickLabel(save.teams, parsePickId(id), pickOwner(save.league, id))}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}
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
      <button onClick={onClose} className="mt-4 h-12 w-full rounded-xl bg-accent font-semibold text-accent-contrast">Done ({selected.length + selectedPicks.length})</button>
    </BottomSheet>
  );
}

function Offers() {
  const save = useSave();
  const act = useGame((s) => s.act);
  const openPlayer = useOpenPlayer();
  const offers = (save.league.offers ?? []).filter((o) => o.expires >= save.league.date);
  if (offers.length === 0) return null;
  const byId = new Map(save.players.map((p) => [p.id, p]));
  const teams = new Map(save.teams.map((t) => [t.id, t]));
  const names = (ids: number[]) => ids.map((id) => byId.get(id)).filter(Boolean).map((p) => p!);
  return (
    <Card title="Offers for you" className="mb-4">
      <ul className="space-y-3">
        {offers.map((o) => {
          const t = teams.get(o.partnerId)!;
          return (
            <li key={o.id} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center gap-2">
                <TeamBadge team={t} size="sm" />
                <span className="font-semibold">{t.city}</span>
                <span className="ml-auto text-xs text-muted">until {new Date(`${o.expires}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </div>
              <p className="text-sm">
                <span className="text-muted">They want </span>
                {names(o.give).map((p) => <button key={p.id} onClick={() => openPlayer(p.id)} className="font-medium hover:underline">{fullName(p)}</button>)}
                <span className="text-muted"> for </span>
                {names(o.get).map((p) => <button key={p.id} onClick={() => openPlayer(p.id)} className="font-medium hover:underline">{fullName(p)} ({p.position}, {p.age})</button>)}
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => void act(() => api().acceptOffer(o.id))} className="h-10 flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-contrast">Accept</button>
                <button onClick={() => void act(() => api().declineOffer(o.id))} className="h-10 flex-1 rounded-xl border border-line text-sm font-semibold">Decline</button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Pick one of your players and see what the league would give for him. */
function ShopPlayer({ onPick }: { onPick: (partnerId: number, give: number[], get: number[]) => void }) {
  const save = useSave();
  const team = useUserTeam();
  const openPlayer = useOpenPlayer();
  const [open, setOpen] = useState(false);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const mine = save.players.filter((p) => p.teamId === team.id && !p.retired && !p.injury);
  const ctx = { league: save.league, teams: save.teams, players: save.players, userTeamId: team.id };
  const offers = playerId !== null ? shopPlayer(ctx, playerId) : [];
  const byId = new Map(save.players.map((p) => [p.id, p]));
  const teams = new Map(save.teams.map((t) => [t.id, t]));
  return (
    <>
      <button onClick={() => setOpen(true)} className="mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-semibold hover:bg-surface-2">
        <Icon name="search" className="size-4" /> Shop one of your players
      </button>
      <BottomSheet open={open} onClose={() => { setOpen(false); setPlayerId(null); }} title="Shop a player">
        {playerId === null ? (
          <>
            <h2 className="mb-3 pr-10 text-xl font-bold">Who are you shopping?</h2>
            <ul className="-mx-2">
              {mine.sort((a, b) => scoutedOverall(b, team.id).ovr - scoutedOverall(a, team.id).ovr).map((p) => (
                <li key={p.id}>
                  <button onClick={() => setPlayerId(p.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
                    <span className="w-7 text-center text-xs font-bold text-muted">{p.position}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{fullName(p)}</span>
                    <RatingBadge value={scoutedOverall(p, team.id).ovr} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <h2 className="mb-1 pr-10 text-xl font-bold">Offers for {fullName(byId.get(playerId)!)}</h2>
            <p className="mb-3 text-sm text-muted">The best player each team would give straight up.</p>
            {offers.length === 0 ? <p className="text-sm text-muted">No takers right now.</p> : (
              <ul className="-mx-2">
                {offers.map((o) => {
                  const p = byId.get(o.get[0]!)!;
                  const t = teams.get(o.partnerId)!;
                  return (
                    <li key={o.partnerId} className="flex items-center gap-2 rounded-xl px-2 py-2">
                      <TeamBadge team={t} size="sm" />
                      <button onClick={() => openPlayer(p.id)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate font-medium">{fullName(p)}</span>
                        <span className="block text-xs text-muted">{p.position} · age {p.age} · {money(p.contract?.salary ?? 0)}</span>
                      </button>
                      <RatingBadge value={scoutedOverall(p, team.id).ovr} size="sm" />
                      <button onClick={() => { setOpen(false); setPlayerId(null); onPick(t.id, [playerId], o.get); }} className="h-9 rounded-lg border border-line px-3 text-xs font-semibold">Talk</button>
                    </li>
                  );
                })}
              </ul>
            )}
            <button onClick={() => setPlayerId(null)} className="mt-4 h-11 w-full rounded-xl border border-line text-sm font-medium">Pick another player</button>
          </>
        )}
      </BottomSheet>
    </>
  );
}
