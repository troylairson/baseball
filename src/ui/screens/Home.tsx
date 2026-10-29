import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { autoPlan, headedToFreeAgency, overall, pickStarter, type HomeLayout } from '../../engine';
import { api, useGame, useSave, useUserTeam } from '../../state/game';
import { Card } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { DivisionStandings } from '../components/Standings';
import { TeamBadge } from '../components/TeamBadge';
import { AssistantCard } from '../components/AssistantCard';
import { FarmCard, HotColdCard, InjuriesCard, TeamLeaders } from '../components/HomeCards';
import { DEFAULT_LAYOUT, GRID_CLASSES, HOME_CARDS, MAX_COLUMNS, resolveLayout, type HomeCardId } from '../home/layout';
import { TrendsCard } from '../components/TrendsCard';
import { GameRow } from '../components/GameRow';
import { Inbox } from '../components/Inbox';
import { fullName, money, shortName } from '../format';
import { useOpenGame, useOpenPlayer } from '../hooks';
import { payrollBudget, spending, teamOverall } from '../teams';

export function Home() {
  const save = useSave();
  const team = useUserTeam();
  const act = useGame((s) => s.act);
  const { players, teams, league } = save;
  const [editing, setEditing] = useState(false);
  // Edits apply locally at once (quick taps build on each other) and save in the background.
  const [draft, setDraft] = useState<HomeLayout | null>(null);
  const layout = draft ?? resolveLayout(league.homeLayout);
  // Saves are debounced and run one at a time, so a burst of taps can't land out of order.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const flush = (next: HomeLayout) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    queue.current = queue.current.then(() => act(() => api().setHomeLayout(next)));
  };
  const saveLayout = (next: HomeLayout) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(next), 500);
  };

  const ovr = teamOverall(players, team.id);
  const rank = [...teams].sort((a, b) => teamOverall(players, b.id) - teamOverall(players, a.id)).findIndex((t) => t.id === team.id) + 1;
  const pay = spending(league, players, team);
  const division = league.divisions.find((d) => d.id === team.divisionId)!;

  const render = (id: HomeCardId): ReactNode => {
    switch (id) {
      case 'trends': return <TrendsCard />;
      case 'todo': return <TodoCard />;
      case 'games': return league.phase === 'offseason' ? <OffseasonCard /> : <GamesCard />;
      case 'injuries': return <InjuriesCard />;
      case 'hotcold': return <HotColdCard />;
      case 'hitters': return <TeamLeaders side="bat" />;
      case 'pitchers': return <TeamLeaders side="pit" />;
      case 'farm': return <FarmCard />;
      case 'owner': return <OwnerCard />;
      case 'assistant': return <AssistantCard />;
      case 'news': return <Inbox news={league.news ?? []} />;
      case 'division': return <Card title="Division"><DivisionStandings division={division} teams={teams} userTeamId={team.id} /></Card>;
    }
  };

  const grid = GRID_CLASSES[layout.columns] ?? GRID_CLASSES[2];
  const span = layout.columns === 1 ? '' : '@lg:col-span-2';

  return (
    <div className="@container">
    <div className={`grid grid-cols-1 gap-4 ${grid}`}>
      <section
        className="relative col-span-full overflow-hidden rounded-2xl p-5 text-white"
        style={{ background: `linear-gradient(135deg, ${team.primaryColor}, ${team.primaryColor}cc 60%, ${team.secondaryColor})` }}
      >
        <div className="flex items-center gap-4">
          <TeamBadge team={team} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-sm opacity-80">{league.season} · {division.name}</p>
            <h1 className="truncate text-2xl font-bold">{team.city} {team.name}</h1>
          </div>
          <button
            onClick={() => {
              if (editing && draft && timer.current) flush(draft);
              setEditing(!editing);
            }}
            className="shrink-0 rounded-full bg-black/25 px-3 py-1.5 text-xs font-semibold hover:bg-black/35"
            aria-pressed={editing}
          >
            {editing ? 'Done' : 'Customize'}
          </button>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Stat label="Record" value={`${team.wins}–${team.losses}`} />
          <Stat label="Team OVR" value={`${ovr} (#${rank})`} />
          <Stat label="Payroll" value={money(pay)} />
        </dl>
      </section>

      {editing && <LayoutBar layout={layout} onChange={saveLayout} />}

      {layout.cards.map((c, i) => {
        if (c.hidden && !editing) return null;
        const meta = HOME_CARDS.find((m) => m.id === c.id)!;
        const card = render(c.id as HomeCardId);
        return (
          // Empty when a card has nothing to show (e.g. Triple-A in the offseason).
          <div key={c.id} className={`${c.wide ? span : ''} ${editing ? '' : 'empty:hidden'} min-w-0`}>
            {editing && (
              <CardTools
                label={meta.label}
                layout={layout}
                index={i}
                onChange={saveLayout}
              />
            )}
            {editing && c.hidden ? null : card}
          </div>
        );
      })}
    </div>
    </div>
  );
}

/** Columns and reset, shown while customizing. */
function LayoutBar({ layout, onChange }: { layout: HomeLayout; onChange: (l: HomeLayout) => void }) {
  return (
    <section className="col-span-full rounded-2xl border border-dashed border-accent bg-accent/5 p-4">
      <p className="font-semibold">Customize your home screen</p>
      <p className="text-sm text-muted">Move cards up or down, make them wide, or hide them. Changes save as you go.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="hidden items-center gap-2 text-sm md:flex">
          Up to
          <div className="flex rounded-lg bg-surface-2 p-0.5" role="group" aria-label="Columns">
            {Array.from({ length: MAX_COLUMNS }, (_, i) => i + 1).map((n) => (
              <button key={n} onClick={() => onChange({ ...layout, columns: n })} aria-pressed={layout.columns === n}
                className={`h-8 w-9 rounded-md text-sm font-semibold ${layout.columns === n ? 'bg-surface shadow-sm' : 'text-muted'}`}>{n}</button>
            ))}
          </div>
          columns
          <span className="text-xs text-muted">(fewer show when the window is narrow)</span>
        </div>
        <button onClick={() => onChange(DEFAULT_LAYOUT)} className="h-8 rounded-lg border border-line px-3 text-sm font-medium hover:bg-surface-2">Reset to default</button>
      </div>
    </section>
  );
}

/** Per-card controls while customizing: move, wide, show/hide. */
function CardTools({ label, layout, index, onChange }: { label: string; layout: HomeLayout; index: number; onChange: (l: HomeLayout) => void }) {
  const card = layout.cards[index]!;
  const set = (patch: Partial<typeof card>) => onChange({ ...layout, cards: layout.cards.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  const move = (by: number) => {
    const cards = [...layout.cards];
    const to = index + by;
    if (to < 0 || to >= cards.length) return;
    [cards[index], cards[to]] = [cards[to]!, cards[index]!];
    onChange({ ...layout, cards });
  };
  const tool = 'h-8 min-w-8 rounded-lg border border-line bg-surface px-2 text-xs font-semibold hover:bg-surface-2 disabled:opacity-30';
  return (
    <div className={`mb-1.5 flex items-center gap-1.5 rounded-xl px-2 py-1.5 ${card.hidden ? 'border border-dashed border-line' : 'bg-surface-2'}`}>
      <span className={`min-w-0 flex-1 truncate text-sm font-medium ${card.hidden ? 'text-muted' : ''}`}>{label}</span>
      <button className={tool} onClick={() => move(-1)} disabled={index === 0} aria-label={`Move ${label} up`}>↑</button>
      <button className={tool} onClick={() => move(1)} disabled={index === layout.cards.length - 1} aria-label={`Move ${label} down`}>↓</button>
      <button className={`${tool} hidden md:inline`} onClick={() => set({ wide: !card.wide })} aria-pressed={card.wide}>{card.wide ? 'Wide' : 'Normal'}</button>
      <button className={tool} onClick={() => set({ hidden: !card.hidden })}>{card.hidden ? 'Show' : 'Hide'}</button>
    </div>
  );
}

function TodoCard() {
  const save = useSave();
  const team = useUserTeam();
  const openPlayer = useOpenPlayer();
  const { players, league } = save;
  const pay = spending(league, players, team);
  const budget = payrollBudget(team);
  const org = players.filter((p) => p.teamId === team.id);
  const topProspect = org
    .filter((p) => p.level === 'AAA')
    .sort((a, b) => overall(b, true) - overall(a, true))[0];
  const expiring = org.filter((p) => p.level === 'MLB' && headedToFreeAgency(p));
  const unhappy = org.filter((p) => (p.morale ?? 50) < 35).sort((a, b) => (a.morale ?? 50) - (b.morale ?? 50));
  return (
    <Card title="To do">
      <ul className="-mx-2 flex flex-col">
        {league.phase === 'preseason' && (
          <Todo icon="roster" to="/play/roster" title="Review your roster" detail="Get to know your players before Opening Day." />
        )}
        {unhappy.length > 0 && (
          <Todo
            icon="alert"
            onClick={() => openPlayer(unhappy[0]!.id)}
            title={`${unhappy.length} unhappy player${unhappy.length > 1 ? 's' : ''}`}
            detail={`${fullName(unhappy[0]!)}${unhappy[0]!.tradeRequested ? ' has asked for a trade' : ' is frustrated'}. Playing time, winning and fair pay help.`}
          />
        )}
        {topProspect && (
          <Todo
            icon="search"
            onClick={() => openPlayer(topProspect.id)}
            title={`Scout your top prospect`}
            detail={`${fullName(topProspect)} (${topProspect.position}, ${topProspect.age}) is developing in AAA.`}
          />
        )}
        {expiring.length > 0 && (
          <Todo icon="pen" to="/play/contracts" title={`${expiring.length} player${expiring.length === 1 ? '' : 's'} can leave as free agents after this season`} detail="Decide who to extend before free agency." />
        )}
        {pay > budget && (
          <Todo icon="alert" to="/play/office" title="Spending is over budget" detail={`${money(pay - budget)} over the owner's ${money(budget)} limit.`} />
        )}
      </ul>
    </Card>
  );
}

function OwnerCard() {
  const { league } = useSave();
  const owner = league.owner;
  if (!owner) return null;
  return (
    <Card title="Owner">
      <p className="text-lg font-semibold">{owner.expectation}</p>
      <p className="mt-1 text-sm text-muted">Target: about {owner.targetWins} wins this season.</p>
      <div className="mt-3 mb-1 flex justify-between text-sm"><span className="text-muted">Job security</span><strong className="tabular-nums">{owner.jobSecurity}%</strong></div>
      <div className="h-2 rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${owner.jobSecurity < 25 ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${owner.jobSecurity}%` }} />
      </div>
      {owner.fired && <p className="mt-2 text-sm text-danger">You've been fired — this league is now in sandbox mode.</p>}
    </Card>
  );
}

function OffseasonCard() {
  const { league } = useSave();
  const label = { review: 'Season review', resign: 'Re-sign your players', freeAgency: 'Free agency is open', draft: 'The draft is on' }[league.offseason ?? 'review'];
  return (
    <Card title="Offseason">
      <p className="text-lg font-semibold">{label}</p>
      <p className="mt-1 text-sm text-muted">Shape next year's roster before the {league.season + 1} season.</p>
      <Link to="/play/offseason" className="mt-3 flex h-11 items-center justify-center rounded-xl bg-accent text-sm font-semibold text-accent-contrast">Go to the offseason</Link>
    </Card>
  );
}

function GamesCard() {
  const { schedule, teams, players, league } = useSave();
  const team = useUserTeam();
  const openGame = useOpenGame();
  const openPlayer = useOpenPlayer();
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const mine = schedule.filter((g) => g.homeId === team.id || g.awayId === team.id);
  const last = mine.filter((g) => g.played).at(-1);
  const next = mine.find((g) => !g.played && g.seriesId === undefined);

  // Probable starters: the next rested arm in each rotation.
  const probable = (teamId: number) => {
    const t = teamMap.get(teamId)!;
    const roster = players.filter((p) => p.teamId === teamId && p.level === 'MLB');
    const plan = autoPlan(roster, league.settings.designatedHitter);
    const id = pickStarter({ ...t }, plan, new Map(roster.map((p) => [p.id, p])), false);
    return players.find((p) => p.id === id);
  };

  if (league.phase === 'playoffs') {
    const series = league.playoffs?.series.find((s) => s.winnerId === null && (s.highId === team.id || s.lowId === team.id));
    const opp = series ? teamMap.get(series.highId === team.id ? series.lowId! : series.highId!) : undefined;
    return (
      <Card title="Playoffs">
        {league.playoffs?.championId != null ? (
          <p className="font-semibold">{teamMap.get(league.playoffs.championId)!.city} won it all. On to the offseason.</p>
        ) : series && opp ? (
          <p className="font-semibold">
            vs {opp.city}: {series.highId === team.id ? series.highWins : series.lowWins}–{series.highId === team.id ? series.lowWins : series.highWins} in a best of {series.bestOf}
          </p>
        ) : (
          <p className="text-sm text-muted">Your season is over. Sim the rest of the playoffs to reach the offseason.</p>
        )}
        <Link to="/play/league" className="mt-3 inline-block text-sm font-medium text-accent">View bracket</Link>
        {last && (
          <div className="mt-3 border-t border-line pt-2">
            <p className="px-2 text-[11px] uppercase tracking-wide text-muted">Last game</p>
            <div className="-mx-2"><GameRow game={last} teamId={team.id} teams={teamMap} onOpen={openGame} /></div>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card title={next ? (league.phase === 'preseason' ? 'Opening Day' : 'Next game') : 'Season'}>
      {next ? (
        <>
          <GameRow game={next} teamId={team.id} teams={teamMap} />
          <Link to="/play/live" className="mt-2 flex h-10 items-center justify-center rounded-xl border border-line text-sm font-semibold hover:bg-surface-2">
            Manage it live
          </Link>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {[team.id, next.homeId === team.id ? next.awayId : next.homeId].map((id) => {
              const sp = probable(id);
              return (
                <button key={id} onClick={() => sp && openPlayer(sp.id)} className="rounded-xl bg-surface-2 px-3 py-2 text-left">
                  <span className="block text-[11px] uppercase tracking-wide text-muted">{teamMap.get(id)!.abbr} starter</span>
                  <span className="block truncate font-medium">{sp ? shortName(sp) : 'TBD'}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">The regular season is complete. Tap Playoffs to begin the postseason.</p>
      )}
      {last && (
        <div className="mt-3 border-t border-line pt-2">
          <p className="px-2 text-[11px] uppercase tracking-wide text-muted">Last game</p>
          <div className="-mx-2">
            <GameRow game={last} teamId={team.id} teams={teamMap} onOpen={openGame} />
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/20 px-2 py-2">
      <dt className="text-[11px] uppercase tracking-wide opacity-75">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Todo({ icon, title, detail, to, onClick }: { icon: IconName; title: string; detail: string; to?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="grid grid-cols-1 size-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted">{detail}</span>
      </span>
      <Icon name="chevron" className="size-4 text-muted" />
    </>
  );
  const cls = 'flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2';
  return (
    <li>
      {to ? <Link to={to} className={cls}>{body}</Link> : <button onClick={onClick} className={cls}>{body}</button>}
    </li>
  );
}
