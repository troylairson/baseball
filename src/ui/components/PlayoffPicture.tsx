import { Fragment } from 'react';
import { playoffPicture, type League, type Team } from '../../engine';
import { winPct } from '../teams';
import { Card } from './Card';
import { TeamBadge } from './TeamBadge';

const fmtGames = (g: number) => (g === 0 ? '—' : g.toFixed(1).replace(/\.0$/, ''));

/** If the season ended today: seeds, division leaders and the wild-card chase. */
export function PlayoffPicture({ league, teams, userTeamId }: { league: League; teams: Team[]; userTeamId: number }) {
  const races = playoffPicture(league, teams);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {races.map((race) => {
        const leaders = race.rows.filter((r) => r.status === 'division');
        const wild = race.rows.filter((r) => r.status === 'wildcard');
        const chase = race.rows.filter((r) => r.status === 'out');
        const row = (r: (typeof race.rows)[number]) => (
          <tr key={r.team.id} className={`border-t border-line ${r.team.id === userTeamId ? 'font-semibold' : ''}`}>
            <td className="w-7 py-2 text-xs text-muted tabular-nums">{r.seed ?? ''}</td>
            <td className="py-2">
              <span className="flex items-center gap-2">
                <TeamBadge team={r.team} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate">{r.team.city}</span>
                  {r.status === 'division' && <span className="block text-[11px] font-normal text-muted">{r.divisionName}</span>}
                </span>
              </span>
            </td>
            <td className="text-right tabular-nums">{r.team.wins}-{r.team.losses}</td>
            <td className="hidden w-14 text-right tabular-nums sm:table-cell">{winPct(r.team).toFixed(3).replace(/^0/, '')}</td>
            <td className={`w-14 text-right tabular-nums ${r.status === 'out' ? 'text-muted' : 'text-accent'}`}>
              {r.status === 'out' ? fmtGames(r.games) : r.games > 0 ? `+${fmtGames(r.games)}` : '—'}
            </td>
          </tr>
        );
        return (
          <Card key={race.conferenceId} title={race.name}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="pb-2 text-left font-medium" colSpan={2}>Division leaders</th>
                  <th className="pb-2 text-right font-medium">W-L</th>
                  <th className="hidden pb-2 text-right font-medium sm:table-cell">PCT</th>
                  <th className="pb-2 text-right font-medium">Lead/GB</th>
                </tr>
              </thead>
              <tbody>{leaders.map(row)}</tbody>
              <tbody>
                <tr>
                  <th colSpan={5} className="pb-2 pt-4 text-left text-xs font-medium text-muted">Wild card</th>
                </tr>
                {wild.map(row)}
                {chase.map((r, i) => (
                  <Fragment key={r.team.id}>
                    {i === 0 && (
                      <tr aria-hidden="true">
                        <td colSpan={5} className="py-1"><div className="border-t-2 border-dashed border-accent/50" /></td>
                      </tr>
                    )}
                    {row(r)}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">
              Seeds if the season ended today. Leaders show their margin over the runner-up; wild cards their cushion over the first team out; everyone else how far back of the last spot they are.
            </p>
          </Card>
        );
      })}
    </div>
  );
}
