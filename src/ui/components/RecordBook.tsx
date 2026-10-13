import { useState } from 'react';
import { CAREER_LEADERS, careerLeaders, SEASON_RECORDS, type League, type Player, type Team } from '../../engine';
import { shortName } from '../format';
import { useOpenPlayer } from '../hooks';
import { Card } from './Card';
import { HistoryList } from './History';
import { Segmented } from './Segmented';
import { TeamBadge } from './TeamBadge';

type View = 'seasons' | 'records' | 'hof';

/** League history: season-by-season results, record books and the Hall of Fame. */
export function RecordBook({ league, teams, players, userTeamId }: { league: League; teams: Team[]; players: Player[]; userTeamId: number }) {
  const [view, setView] = useState<View>('seasons');
  return (
    <>
      <div className="mb-4">
        <Segmented
          label="History view"
          value={view}
          onChange={setView}
          options={[{ value: 'seasons', label: 'Seasons' }, { value: 'records', label: 'Records' }, { value: 'hof', label: 'Hall of Fame' }]}
        />
      </div>
      {view === 'seasons' && <HistoryList history={league.history ?? []} teams={teams} players={players} userTeamId={userTeamId} />}
      {view === 'records' && <Records league={league} teams={teams} players={players} />}
      {view === 'hof' && <HallOfFame league={league} players={players} />}
    </>
  );
}

function Records({ league, teams, players }: { league: League; teams: Team[]; players: Player[] }) {
  const openPlayer = useOpenPlayer();
  const byId = new Map(players.map((p) => [p.id, p]));
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const records = league.records ?? {};
  if (!Object.keys(records).length) return <p className="py-16 text-center text-sm text-muted">Records are set at the end of each season.</p>;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card title="Single-season records">
        <ul className="-mx-2">
          {SEASON_RECORDS.filter((c) => records[c.key]).map((c) => {
            const r = records[c.key]!;
            const p = byId.get(r.playerId);
            const t = teamMap.get(r.teamId);
            return (
              <li key={c.key}>
                <button onClick={() => p && openPlayer(p.id)} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2">
                  <span className="w-28 shrink-0 text-xs text-muted">{c.label}</span>
                  {t && <TeamBadge team={t} size="sm" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p ? shortName(p) : '—'} <span className="text-xs text-muted">{r.season}</span></span>
                  <span className="text-sm font-semibold tabular-nums">{c.format(r.value)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      {CAREER_LEADERS.map((cat) => {
        const top = careerLeaders(players, cat, 5);
        if (!top.length) return null;
        return (
          <Card key={cat.key} title={`Career ${cat.label}`}>
            <ol className="-mx-2">
              {top.map((p, i) => (
                <li key={p.id}>
                  <button onClick={() => openPlayer(p.id)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2">
                    <span className="w-4 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {shortName(p)} {p.retired && <span className="text-xs text-muted">(ret.)</span>}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{cat.format(cat.value(p.career!))}</span>
                  </button>
                </li>
              ))}
            </ol>
          </Card>
        );
      })}
    </div>
  );
}

function HallOfFame({ league, players }: { league: League; players: Player[] }) {
  const openPlayer = useOpenPlayer();
  const byId = new Map(players.map((p) => [p.id, p]));
  const hof = [...(league.hallOfFame ?? [])].reverse();
  if (!hof.length) {
    return <p className="py-16 text-center text-sm text-muted">No one has been inducted yet. Retired stars become eligible a year after they hang it up.</p>;
  }
  return (
    <Card title={`Inductees (${hof.length})`}>
      <ul className="-mx-2">
        {hof.map((h) => {
          const p = byId.get(h.playerId);
          return (
            <li key={h.playerId}>
              <button onClick={() => p && openPlayer(h.playerId)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
                <span className="w-12 text-xs font-semibold text-muted">{h.season}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p ? `${p.firstName} ${p.lastName}` : '—'} <span className="text-xs text-muted">{p?.position}</span></span>
                  <span className="block truncate text-xs text-muted">{h.summary}</span>
                </span>
                <span className="text-xs font-semibold tabular-nums">{h.votePct}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
