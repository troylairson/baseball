import { useMemo, useState } from 'react';
import { useSave, useUserTeam } from '../../state/game';
import { Card, PageHeader } from '../components/Card';
import { GameRow, ScoreTile } from '../components/GameRow';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { formatDate } from '../format';
import { useOpenGame } from '../hooks';

type View = 'mine' | 'scores';
const VIEWS = [
  { value: 'mine', label: 'My Schedule' },
  { value: 'scores', label: 'Scores' },
] as const;

export function Games() {
  const [view, setView] = useState<View>('mine');
  const { schedule } = useSave();
  const played = schedule.filter((g) => g.played).length;
  return (
    <>
      <PageHeader title="Games" subtitle={`${played} of ${schedule.length} league games played`} />
      <div className="mb-4">
        <Segmented label="Games view" options={VIEWS} value={view} onChange={setView} />
      </div>
      {view === 'mine' ? <MySchedule /> : <Scores />}
    </>
  );
}

function MySchedule() {
  const { schedule, teams } = useSave();
  const team = useUserTeam();
  const openGame = useOpenGame();
  const [showAll, setShowAll] = useState(false);
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const mine = schedule.filter((g) => g.homeId === team.id || g.awayId === team.id);
  const results = mine.filter((g) => g.played).reverse();
  const upcoming = mine.filter((g) => !g.played);

  if (showAll) {
    return (
      <Card title={`Full schedule (${mine.length})`} action={<button onClick={() => setShowAll(false)} className="text-sm font-medium text-accent">Less</button>}>
        <div className="-mx-2">
          {mine.map((g) => <GameRow key={g.id} game={g} teamId={team.id} teams={teamMap} onOpen={openGame} />)}
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card title="Recent results">
        {results.length === 0 ? (
          <p className="text-sm text-muted">No games played yet. Tap Play to start the season.</p>
        ) : (
          <div className="-mx-2">
            {results.slice(0, 10).map((g) => <GameRow key={g.id} game={g} teamId={team.id} teams={teamMap} onOpen={openGame} />)}
          </div>
        )}
      </Card>
      <Card title="Upcoming" action={<button onClick={() => setShowAll(true)} className="text-sm font-medium text-accent">Full schedule</button>}>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">The regular season is complete.</p>
        ) : (
          <div className="-mx-2">
            {upcoming.slice(0, 10).map((g) => <GameRow key={g.id} game={g} teamId={team.id} teams={teamMap} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

function Scores() {
  const { schedule, teams } = useSave();
  const openGame = useOpenGame();
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const dates = useMemo(() => [...new Set(schedule.filter((g) => g.played).map((g) => g.date))], [schedule]);
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked && dates.includes(picked) ? picked : dates[dates.length - 1];

  if (!date) return <p className="py-16 text-center text-sm text-muted">No games have been played yet.</p>;
  const idx = dates.indexOf(date);
  const games = schedule.filter((g) => g.date === date && g.played);

  return (
    <>
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-line bg-surface p-1">
        <button disabled={idx <= 0} onClick={() => setPicked(dates[idx - 1]!)} className="grid grid-cols-1 size-10 place-items-center rounded-xl hover:bg-surface-2 disabled:opacity-30" aria-label="Previous day">
          <Icon name="back" />
        </button>
        <span className="font-semibold">{formatDate(date)}</span>
        <button disabled={idx >= dates.length - 1} onClick={() => setPicked(dates[idx + 1]!)} className="grid grid-cols-1 size-10 place-items-center rounded-xl hover:bg-surface-2 disabled:opacity-30" aria-label="Next day">
          <Icon name="chevron" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        {games.map((g) => <ScoreTile key={g.id} game={g} teams={teamMap} onOpen={openGame} />)}
      </div>
    </>
  );
}
