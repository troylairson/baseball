import { useMemo, useState } from 'react';
import { useSave } from '../../state/game';
import { Card, PageHeader } from '../components/Card';
import { Bracket } from '../components/Bracket';
import { RecordBook } from '../components/RecordBook';
import { LeaderBoard } from '../components/Leaders';
import { BATTING_LEADERS, PITCHING_LEADERS } from '../stats';
import { RatingBadge } from '../components/Rating';
import { Segmented } from '../components/Segmented';
import { DivisionStandings } from '../components/Standings';
import { TeamBadge } from '../components/TeamBadge';
import { money } from '../format';
import { payroll, teamOverall } from '../teams';

type View = 'standings' | 'leaders' | 'playoffs' | 'history' | 'power';

export function League() {
  const { league, teams, players, meta, stats } = useSave();
  const [picked, setView] = useState<View | null>(null);
  const view: View = picked ?? (league.phase === 'playoffs' ? 'playoffs' : 'standings');
  const VIEWS = [
    { value: 'standings', label: 'Standings' },
    { value: 'leaders', label: 'Leaders' },
    ...(league.playoffs ? [{ value: 'playoffs', label: 'Playoffs' }] : [{ value: 'power', label: 'Power' }]),
    { value: 'history', label: 'History' },
  ] as { value: View; label: string }[];
  const [side, setSide] = useState<'bat' | 'pit'>('bat');
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const teamGames = Math.max(...teams.map((t) => t.wins + t.losses));

  const ranked = teams
    .map((t) => ({ team: t, ovr: teamOverall(players, t.id), pay: payroll(players, t.id) }))
    .sort((a, b) => b.ovr - a.ovr || b.pay - a.pay);

  return (
    <>
      <PageHeader title={league.settings.name} subtitle={`${league.season} · ${teams.length} teams`} />
      <div className="mb-4">
        <Segmented label="League view" options={VIEWS} value={view} onChange={setView} />
      </div>

      {view === 'playoffs' && league.playoffs ? (
        <Bracket playoffs={league.playoffs} teams={teams} userTeamId={meta.userTeamId} />
      ) : view === 'history' ? (
        <RecordBook league={league} teams={teams} players={players} userTeamId={meta.userTeamId} />
      ) : view === 'leaders' ? (
        <>
          <div className="mb-4 flex gap-2">
            {(['bat', 'pit'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setSide(k)}
                className={`h-9 rounded-full px-4 text-sm font-medium ${side === k ? 'bg-ink text-bg' : 'bg-surface-2 text-muted'}`}
              >
                {k === 'bat' ? 'Batting' : 'Pitching'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(side === 'bat' ? BATTING_LEADERS : PITCHING_LEADERS).map((l) => (
              <LeaderBoard key={l.key} leader={l} stats={stats} players={playerMap} teams={teamMap} teamGames={teamGames} />
            ))}
          </div>
        </>
      ) : view === 'standings' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {league.divisions.map((d) => (
            <Card key={d.id}>
              <DivisionStandings division={d} teams={teams} userTeamId={meta.userTeamId} />
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <ol className="-mx-2">
            {ranked.map(({ team, ovr, pay }, i) => (
              <li key={team.id} className={`flex items-center gap-3 rounded-xl px-2 py-2 ${team.id === meta.userTeamId ? 'bg-accent/10' : ''}`}>
                <span className="w-6 text-right text-sm font-semibold text-muted tabular-nums">{i + 1}</span>
                <TeamBadge team={team} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{team.city} {team.name}</span>
                  <span className="block text-xs text-muted">{money(pay)} payroll</span>
                </span>
                <RatingBadge value={ovr} size="sm" />
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted">Ranked by average roster rating.</p>
        </Card>
      )}
    </>
  );
}
