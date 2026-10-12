import { Link } from 'react-router-dom';
import { autoPlan, avg, isPitcher, overall, pickStarter, rate3, type Player } from '../../engine';
import { useSave, useUserTeam } from '../../state/game';
import { Card } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { RatingBadge } from '../components/Rating';
import { DivisionStandings } from '../components/Standings';
import { TeamBadge } from '../components/TeamBadge';
import { GameRow } from '../components/GameRow';
import { Inbox } from '../components/Inbox';
import { fullName, money, shortName } from '../format';
import { useOpenGame, useOpenPlayer } from '../hooks';
import { scoutedOverall } from '../scouting';
import { payrollBudget, spending, teamOverall } from '../teams';

export function Home() {
  const save = useSave();
  const team = useUserTeam();
  const openPlayer = useOpenPlayer();
  const { players, teams, league } = save;

  const ovr = teamOverall(players, team.id);
  const rank = [...teams].sort((a, b) => teamOverall(players, b.id) - teamOverall(players, a.id)).findIndex((t) => t.id === team.id) + 1;
  const pay = spending(league, players, team);
  const budget = payrollBudget(team);
  const org = players.filter((p) => p.teamId === team.id);
  const topProspect = org
    .filter((p) => p.level === 'AAA')
    .sort((a, b) => overall(b, true) - overall(a, true))[0];
  const expiring = org.filter((p) => p.level === 'MLB' && p.contract?.years === 1);
  const division = league.divisions.find((d) => d.id === team.divisionId)!;
  const statsById = new Map(save.stats.map((s) => [s.playerId, s]));
  const slumping = org
    .filter((p) => p.level === 'MLB' && !isPitcher(p))
    .map((player) => ({ player, stats: statsById.get(player.id)! }))
    .filter(({ stats }) => stats && stats.bat.pa >= 60 && avg(stats.bat) < 0.2)
    .sort((a, b) => avg(a.stats.bat) - avg(b.stats.bat))[0];


  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section
        className="relative overflow-hidden rounded-2xl p-5 text-white md:col-span-2"
        style={{ background: `linear-gradient(135deg, ${team.primaryColor}, ${team.primaryColor}cc 60%, ${team.secondaryColor})` }}
      >
        <div className="flex items-center gap-4">
          <TeamBadge team={team} size="lg" />
          <div className="min-w-0">
            <p className="text-sm opacity-80">{league.season} · {division.name}</p>
            <h1 className="truncate text-2xl font-bold">{team.city} {team.name}</h1>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Stat label="Record" value={`${team.wins}–${team.losses}`} />
          <Stat label="Team OVR" value={`${ovr} (#${rank})`} />
          <Stat label="Payroll" value={money(pay)} />
        </dl>
      </section>

      <Card title="To do" className="md:row-span-2">
        <ul className="-mx-2 flex flex-col">
          {league.phase === 'preseason' && (
            <Todo icon="roster" to="/play/roster" title="Review your roster" detail="Get to know your players before Opening Day." />
          )}
          {slumping && (
            <Todo
              icon="alert"
              onClick={() => openPlayer(slumping.player.id)}
              title={`${fullName(slumping.player)} is struggling`}
              detail={`Hitting ${rate3(avg(slumping.stats.bat))} in ${slumping.stats.bat.pa} plate appearances.`}
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
            <Todo icon="pen" to="/play/office" title={`${expiring.length} contracts expire this season`} detail="Decide who to extend before free agency." />
          )}
          {pay > budget && (
            <Todo icon="alert" to="/play/office" title="Spending is over budget" detail={`${money(pay - budget)} over the owner's ${money(budget)} limit.`} />
          )}
        </ul>
      </Card>

      <OwnerCard />

      {league.phase === 'offseason' ? <OffseasonCard /> : <GamesCard />}

      <div className="md:col-span-2">
        <Inbox news={league.news ?? []} />
      </div>

      <Card title="Division" className="md:col-span-2">
        <DivisionStandings division={division} teams={teams} userTeamId={team.id} />
      </Card>

      <Card title="Best players" className="md:col-span-2">
        <ul className="-mx-2">
          {org.filter((p) => p.level === 'MLB').sort((a, b) => overall(b) - overall(a)).slice(0, 3).map((p: Player) => (
            <li key={p.id}>
              <button onClick={() => openPlayer(p.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
                <span className="w-8 text-center text-xs font-bold text-muted">{p.position}</span>
                <span className="flex-1 font-medium">{fullName(p)}</span>
                <RatingBadge value={scoutedOverall(p, team.id).ovr} size="sm" />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
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
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
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
