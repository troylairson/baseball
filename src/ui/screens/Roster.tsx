import { useState } from 'react';
import { isPitcher, rosterIssues, type Player } from '../../engine';
import { useSave, useUserTeam } from '../../state/game';
import { Card, PageHeader } from '../components/Card';
import { PlayerCard } from '../components/PlayerCard';
import { Segmented } from '../components/Segmented';
import { byPosition, money } from '../format';
import { useOpenPlayer } from '../hooks';
import { statSummary, useStatsMap } from '../stats';
import { payroll } from '../teams';
import { LineupEditor } from './roster/LineupEditor';
import { StaffEditor } from './roster/StaffEditor';

type View = 'lineup' | 'staff' | 'active' | 'aaa';
const VIEWS = [
  { value: 'lineup', label: 'Lineup' },
  { value: 'staff', label: 'Staff' },
  { value: 'active', label: 'Active' },
  { value: 'aaa', label: 'AAA' },
] as const;

export function Roster() {
  const { players, league } = useSave();
  const team = useUserTeam();
  const openPlayer = useOpenPlayer();
  const stats = useStatsMap();
  const [view, setView] = useState<View>('lineup');

  const org = players.filter((p) => p.teamId === team.id && !p.retired);
  const mlb = org.filter((p) => p.level === 'MLB' && !p.injury);
  const injured = org.filter((p) => p.injury);
  const issues = rosterIssues(mlb);

  const list = (title: string, items: Player[]) => (
    <Card key={title} title={`${title} (${items.length})`} className="px-2 sm:px-4">
      {items.map((p) => (
        <PlayerCard key={p.id} player={p} userTeamId={team.id} onOpen={openPlayer} statLine={statSummary(p, stats.get(p.id))} />
      ))}
    </Card>
  );

  return (
    <>
      <PageHeader
        title="Roster"
        subtitle={`${mlb.length}/26 active${injured.length ? ` · ${injured.length} injured` : ''} · ${money(payroll(players, team.id))} payroll`}
      />
      {issues.length > 0 && (
        <div className="mb-4 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          {issues.map((i) => <p key={i.kind}>{i.message}</p>)}
          <p className="mt-1 text-muted">Unfixed problems are filled automatically before the next game.</p>
        </div>
      )}
      <div className="mb-4">
        <Segmented label="Roster view" options={VIEWS} value={view} onChange={setView} />
      </div>
      {view === 'lineup' && <LineupEditor userTeamId={team.id} useDH={league.settings.designatedHitter} />}
      {view === 'staff' && <StaffEditor userTeamId={team.id} />}
      {view === 'active' && (
        <div className="flex flex-col gap-4">
          {list('Position players', mlb.filter((p) => !isPitcher(p)).sort(byPosition))}
          {list('Pitchers', mlb.filter(isPitcher).sort(byPosition))}
          {injured.length > 0 && list('Injured list', injured.sort((a, b) => b.injury!.days - a.injury!.days))}
        </div>
      )}
      {view === 'aaa' && (
        <div className="flex flex-col gap-4">
          {list('Hitters', org.filter((p) => p.level === 'AAA' && !p.injury && !isPitcher(p)).sort(byPosition))}
          {list('Pitchers', org.filter((p) => p.level === 'AAA' && !p.injury && isPitcher(p)).sort(byPosition))}
        </div>
      )}
    </>
  );
}
