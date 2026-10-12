import { Link } from 'react-router-dom';
import { overall, type Player } from '../../engine';
import { useSave, useUserTeam } from '../../state/game';
import { Card } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { RatingBadge } from '../components/Rating';
import { DivisionStandings } from '../components/Standings';
import { TeamBadge } from '../components/TeamBadge';
import { fullName, money } from '../format';
import { useOpenPlayer } from '../hooks';
import { scoutedOverall } from '../scouting';
import { payroll, payrollBudget, teamOverall } from '../teams';

export function Home() {
  const save = useSave();
  const team = useUserTeam();
  const openPlayer = useOpenPlayer();
  const { players, teams, league } = save;

  const ovr = teamOverall(players, team.id);
  const rank = [...teams].sort((a, b) => teamOverall(players, b.id) - teamOverall(players, a.id)).findIndex((t) => t.id === team.id) + 1;
  const pay = payroll(players, team.id);
  const budget = payrollBudget(team);
  const org = players.filter((p) => p.teamId === team.id);
  const topProspect = org
    .filter((p) => p.level === 'AAA')
    .sort((a, b) => overall(b, true) - overall(a, true))[0];
  const expiring = org.filter((p) => p.level === 'MLB' && p.contract?.years === 1);
  const division = league.divisions.find((d) => d.id === team.divisionId)!;

  const expectation = rank <= teams.length / 4 ? 'Win the division' : rank <= teams.length / 2 ? 'Contend for a playoff spot' : rank <= (teams.length * 3) / 4 ? 'Finish above .500' : 'Rebuild and develop youth';

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
          <Todo icon="roster" to="/play/roster" title="Review your roster" detail="Get to know your players before Opening Day." />
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
            <Todo icon="alert" to="/play/office" title="Payroll is over budget" detail={`${money(pay - budget)} over the owner's ${money(budget)} limit.`} />
          )}
        </ul>
      </Card>

      <Card title="Owner expectations">
        <p className="text-lg font-semibold">{expectation}</p>
        <p className="mt-1 text-sm text-muted">Based on your roster ranking #{rank} of {teams.length}. Job security starts at 100%.</p>
        <div className="mt-3 h-2 rounded-full bg-surface-2">
          <div className="h-full w-full rounded-full bg-accent" />
        </div>
      </Card>

      <Card title="Next game">
        <p className="font-medium">Opening Day</p>
        <p className="text-sm text-muted">The schedule and game simulation arrive in the next build.</p>
      </Card>

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
