import { useState } from 'react';
import { isPitcher, type Player } from '../../engine';
import { useSave, useUserTeam } from '../../state/game';
import { Card, PageHeader } from '../components/Card';
import { PlayerCard } from '../components/PlayerCard';
import { Segmented } from '../components/Segmented';
import { byPosition, money } from '../format';
import { useOpenPlayer } from '../hooks';
import { payroll } from '../teams';

type View = 'hitters' | 'pitchers' | 'aaa';
const VIEWS = [
  { value: 'hitters', label: 'Hitters' },
  { value: 'pitchers', label: 'Pitchers' },
  { value: 'aaa', label: 'AAA' },
] as const;

export function Roster() {
  const { players } = useSave();
  const team = useUserTeam();
  const openPlayer = useOpenPlayer();
  const [view, setView] = useState<View>('hitters');

  const org = players.filter((p) => p.teamId === team.id);
  const mlb = org.filter((p) => p.level === 'MLB');
  const groups: [string, Player[]][] =
    view === 'hitters'
      ? [['Position players', mlb.filter((p) => !isPitcher(p)).sort(byPosition)]]
      : view === 'pitchers'
        ? [
            ['Rotation', mlb.filter((p) => p.position === 'SP')],
            ['Bullpen', mlb.filter((p) => p.position === 'RP')],
          ]
        : [
            ['Hitters', org.filter((p) => p.level === 'AAA' && !isPitcher(p)).sort(byPosition)],
            ['Pitchers', org.filter((p) => p.level === 'AAA' && isPitcher(p)).sort(byPosition)],
          ];

  return (
    <>
      <PageHeader title="Roster" subtitle={`${mlb.length}/26 active · ${money(payroll(players, team.id))} payroll`} />
      <div className="mb-4">
        <Segmented label="Roster view" options={VIEWS} value={view} onChange={setView} />
      </div>
      <div className="flex flex-col gap-4">
        {groups.map(([title, list]) => (
          <Card key={title} title={`${title} (${list.length})`} className="px-2 sm:px-4">
            <div className="-mx-0 flex flex-col">
              {list.map((p) => (
                <PlayerCard key={p.id} player={p} userTeamId={team.id} onOpen={openPlayer} />
              ))}
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-muted">Lineups, depth charts and call-ups arrive with game simulation.</p>
    </>
  );
}
