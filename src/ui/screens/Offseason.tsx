import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { contractDemand, freeAgents, isPitcher, type OffseasonStage, type Player } from '../../engine';
import { api, useGame, useSave, useUserTeam } from '../../state/game';
import { BudgetBar } from '../components/BudgetBar';
import { Card, PageHeader } from '../components/Card';
import { Icon } from '../components/Icon';
import { RatingBadge } from '../components/Rating';
import { Segmented } from '../components/Segmented';
import { TeamBadge } from '../components/TeamBadge';
import { fullName, money, shortName } from '../format';
import { useOpenPlayer } from '../hooks';
import { scoutedOverall } from '../scouting';
import { payrollBudget, spending } from '../teams';

const STAGES: { key: OffseasonStage | 'season'; label: string }[] = [
  { key: 'review', label: 'Review' },
  { key: 'resign', label: 'Re-sign' },
  { key: 'freeAgency', label: 'Free agency' },
  { key: 'draft', label: 'Draft' },
  { key: 'season', label: 'New season' },
];

const NEXT_LABEL: Record<OffseasonStage, string> = {
  review: 'Continue: development & contracts',
  resign: 'Continue to free agency',
  freeAgency: 'Continue to the draft',
  draft: 'Finish draft & start new season',
};

export function Offseason() {
  const save = useSave();
  const act = useGame((s) => s.act);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const stage = save.league.offseason;
  if (save.league.phase !== 'offseason' || !stage) return <Navigate to="/play/home" replace />;
  const idx = STAGES.findIndex((s) => s.key === stage);

  const next = async () => {
    setBusy(true);
    const err = await act(() => api().advance());
    setBusy(false);
    if (!err && stage === 'draft') navigate('/play/home');
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <PageHeader title="Offseason" subtitle={`${save.league.season} → ${save.league.season + 1}`} />
      <ol className="mb-5 flex gap-1" aria-label="Offseason progress">
        {STAGES.map((s, i) => (
          <li key={s.key} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= idx ? 'bg-accent' : 'bg-surface-2'}`} />
            <span className={`mt-1 block truncate text-[11px] ${i === idx ? 'font-semibold text-ink' : 'text-muted'}`}>{s.label}</span>
          </li>
        ))}
      </ol>

      {stage === 'review' && <Review />}
      {stage === 'resign' && <Resign />}
      {stage === 'freeAgency' && <FreeAgency />}
      {stage === 'draft' && <Draft />}

      {stage !== 'review' && (
        <button
          onClick={() => void act(() => api().assistantStage())}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold hover:bg-surface-2"
        >
          <Icon name="staff" className="size-4" /> Let my assistant decide
        </button>
      )}

      <div className="pb-safe sticky bottom-20 z-20 mt-4 md:bottom-4">
        <button
          onClick={() => void next()}
          disabled={busy}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-base font-semibold text-accent-contrast shadow-lg disabled:opacity-60"
        >
          {busy ? 'Working…' : NEXT_LABEL[stage]} <Icon name="chevron" className="size-5" />
        </button>
      </div>
    </>
  );
}

function Review() {
  const { league, teams, players } = useSave();
  const team = useUserTeam();
  const openPlayer = useOpenPlayer();
  const record = league.history?.at(-1);
  const owner = league.owner!;
  const byId = new Map(players.map((p) => [p.id, p]));
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const champ = record?.championId != null ? teamMap.get(record.championId) : undefined;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {champ && (
        <section className="rounded-2xl p-5 text-white md:col-span-2" style={{ background: `linear-gradient(135deg, ${champ.primaryColor}, ${champ.secondaryColor})` }}>
          <p className="text-sm opacity-80">{record!.season} Champions</p>
          <div className="mt-2 flex items-center gap-3">
            <TeamBadge team={champ} size="lg" />
            <h2 className="text-2xl font-bold">{champ.city} {champ.name}</h2>
          </div>
        </section>
      )}
      <Card title="Your season">
        <p className="text-2xl font-bold tabular-nums">{team.wins}–{team.losses}</p>
        <p className="mt-1 text-sm text-muted">{owner.lastReview}</p>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-sm"><span className="text-muted">Job security</span><strong>{owner.jobSecurity}%</strong></div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className={`h-full rounded-full ${owner.jobSecurity < 25 ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${owner.jobSecurity}%` }} />
          </div>
        </div>
        {owner.fired && (
          <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            The owner has let you go. You can keep playing this league, or start a new career from Settings.
          </p>
        )}
      </Card>
      <Card title="Awards">
        <ul className="-mx-2">
          {record?.awards.map((a) => {
            const p = byId.get(a.playerId);
            const t = a.teamId !== null ? teamMap.get(a.teamId) : undefined;
            return (
              <li key={a.name}>
                <button onClick={() => p && openPlayer(p.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
                  {t && <TeamBadge team={t} size="sm" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-muted">{a.name}</span>
                    <span className="block truncate font-medium">{p ? fullName(p) : '—'}</span>
                    <span className="block truncate text-xs text-muted">{a.summary}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="text-sm text-muted md:col-span-2">
        Next, players age and develop, some retire, and contracts tick down. You'll then decide who to bring back.
      </p>
    </div>
  );
}

function PlayerRow({ p, userTeamId, right, onOpen }: { p: Player; userTeamId: number; right: React.ReactNode; onOpen: (id: number) => void }) {
  const { ovr, pot } = scoutedOverall(p, userTeamId);
  return (
    <li className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
      <button onClick={() => onOpen(p.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 text-left">
        <span className="w-7 shrink-0 text-center text-xs font-bold text-muted">{p.position}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{fullName(p)}</span>
          <span className="block truncate text-xs text-muted">
            Age {p.age}
            {p.expiring === 'arbitration' && p.demand ? ` · arbitration ${money(p.demand.salary)}` : p.demand ? ` · asks ${money(p.demand.salary)} × ${p.demand.years}` : ''}
          </span>
        </span>
        <RatingBadge value={ovr} size="sm" />
        <RatingBadge value={pot} size="sm" />
      </button>
      {right}
    </li>
  );
}

function Resign() {
  const save = useSave();
  const team = useUserTeam();
  const act = useGame((s) => s.act);
  const openPlayer = useOpenPlayer();
  const expiring = save.players.filter((p) => p.teamId === team.id && p.contract?.years === 0);
  const committed = save.players.filter((p) => p.teamId === team.id && (p.contract?.years ?? 0) > 0).reduce((s, p) => s + p.contract!.salary, 0);

  return (
    <div className="grid gap-4">
      <Card><BudgetBar used={committed} budget={payrollBudget(team)} label="Next season's commitments" /></Card>
      <Card title={`Expiring contracts (${expiring.length})`} className="px-2 sm:px-4">
        {expiring.length === 0 ? (
          <p className="px-2 text-sm text-muted">Nobody to decide on. Young players under team control were renewed automatically.</p>
        ) : (
          <ul>
            {expiring.map((p) => (
              <PlayerRow
                key={p.id}
                p={p}
                userTeamId={team.id}
                onOpen={openPlayer}
                right={
                  <span className="flex shrink-0 gap-1">
                    <button onClick={() => void act(() => api().resign(p.id))} className="h-9 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-contrast">
                      {p.expiring === 'arbitration' ? 'Tender' : 'Re-sign'}
                    </button>
                    <button onClick={() => void act(() => api().letGo(p.id))} className="h-9 rounded-lg border border-line px-3 text-xs font-semibold" aria-label={`Let ${fullName(p)} go`}>
                      <Icon name="close" className="size-4" />
                    </button>
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </Card>
      <p className="text-sm text-muted">
        Players with 3–5 years of service go to arbitration (one-year deals, cheaper than the market); 6+ years can walk as free agents.
        Anyone left undecided hits free agency when you continue.
      </p>
    </div>
  );
}

export function FreeAgency() {
  const save = useSave();
  const team = useUserTeam();
  const act = useGame((s) => s.act);
  const openPlayer = useOpenPlayer();
  const [side, setSide] = useState<'all' | 'bat' | 'pit'>('all');
  const pool = useMemo(
    () => freeAgents(save.players)
      .filter((p) => side === 'all' || (side === 'pit') === isPitcher(p))
      .map((p) => ({ p, ...scoutedOverall(p, team.id) }))
      .sort((a, b) => b.ovr - a.ovr || b.pot - a.pot)
      .slice(0, 60),
    [save.players, side, team.id],
  );

  return (
    <div className="grid gap-4">
      <Card><BudgetBar used={spending(save.league, save.players, team)} budget={payrollBudget(team)} label="Total spending" /></Card>
      <Segmented
        label="Position filter"
        value={side}
        onChange={setSide}
        options={[{ value: 'all', label: 'All' }, { value: 'bat', label: 'Hitters' }, { value: 'pit', label: 'Pitchers' }]}
      />
      <Card title="Available" className="px-2 sm:px-4">
        {pool.length === 0 ? (
          <p className="px-2 text-sm text-muted">The market is empty.</p>
        ) : (
          <ul>
            {pool.map(({ p }) => {
              const d = p.demand ?? contractDemand(p);
              return (
                <PlayerRow
                  key={p.id}
                  p={p}
                  userTeamId={team.id}
                  onOpen={openPlayer}
                  right={
                    <button onClick={() => void act(() => api().signFreeAgent(p.id))} className="h-9 shrink-0 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-contrast">
                      {money(d.salary)}
                    </button>
                  }
                />
              );
            })}
          </ul>
        )}
      </Card>
      <p className="text-sm text-muted">Other teams sign the rest of the market when you continue. Signed players join your active roster; the weakest player at that spot moves to AAA.</p>
    </div>
  );
}

function Draft() {
  const save = useSave();
  const team = useUserTeam();
  const act = useGame((s) => s.act);
  const openPlayer = useOpenPlayer();
  const draft = save.league.draft!;
  const teamMap = new Map(save.teams.map((t) => [t.id, t]));
  const byId = new Map(save.players.map((p) => [p.id, p]));
  const pick = draft.picks[draft.current];
  const onClock = pick?.teamId === team.id;
  const pool = save.players
    .filter((p) => p.draftProspect && p.teamId === null)
    .map((p) => ({ p, ...scoutedOverall(p, team.id) }))
    .sort((a, b) => b.pot - a.pot || b.ovr - a.ovr)
    .slice(0, 50);
  const made = draft.picks.filter((x) => x.playerId !== null);
  const mine = made.filter((x) => x.teamId === team.id);

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_18rem]">
      <div className="grid gap-4">
        <div className={`rounded-2xl border p-4 ${onClock ? 'border-accent bg-accent/10' : 'border-line bg-surface'}`}>
          {pick ? (
            onClock ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">You're on the clock</p>
                  <p className="text-sm text-muted">Round {pick.round}, pick #{pick.overall}</p>
                </div>
                <button onClick={() => void act(() => api().autoPick())} className="h-10 rounded-full border border-line bg-surface px-4 text-sm font-medium">Auto-pick</button>
              </div>
            ) : (
              <p className="text-sm">Pick #{pick.overall}: {teamMap.get(pick.teamId)?.city} on the clock.</p>
            )
          ) : (
            <p className="font-semibold">The draft is complete.</p>
          )}
        </div>
        <Card title="Best available" className="px-2 sm:px-4">
          <ul>
            {pool.map(({ p }) => (
              <PlayerRow
                key={p.id}
                p={p}
                userTeamId={team.id}
                onOpen={openPlayer}
                right={onClock ? (
                  <button onClick={() => void act(() => api().draft(p.id))} className="h-9 shrink-0 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-contrast">Draft</button>
                ) : null}
              />
            ))}
          </ul>
        </Card>
        <p className="text-sm text-muted">Prospect grades are your scouts' best guess — the shaded ranges on each player show how unsure they are.</p>
      </div>
      <div className="grid content-start gap-4">
        <Card title="Your picks">
          {mine.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
            <ul className="space-y-1 text-sm">
              {mine.map((x) => {
                const p = byId.get(x.playerId!);
                return <li key={x.overall}><span className="text-muted">#{x.overall}</span> {p ? `${shortName(p)}, ${p.position}` : '—'}</li>;
              })}
            </ul>
          )}
        </Card>
        <Card title="Recent picks">
          <ul className="space-y-1 text-sm">
            {made.slice(-8).reverse().map((x) => {
              const p = byId.get(x.playerId!);
              return (
                <li key={x.overall} className="flex gap-2">
                  <span className="w-8 text-muted tabular-nums">#{x.overall}</span>
                  <span className="w-10 font-semibold">{teamMap.get(x.teamId)?.abbr}</span>
                  <span className="truncate">{p ? `${shortName(p)}, ${p.position}` : '—'}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
