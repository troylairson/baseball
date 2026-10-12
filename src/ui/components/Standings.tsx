import type { Division, Team } from '../../engine';
import { gamesBack, standingsSort, winPct } from '../teams';
import { TeamBadge } from './TeamBadge';

export function DivisionStandings({ division, teams, userTeamId }: { division: Division; teams: Team[]; userTeamId: number }) {
  const rows = teams.filter((t) => t.divisionId === division.id).sort(standingsSort);
  const leader = rows[0];
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="text-xs text-muted">
          <th className="pb-2 text-left font-medium">{division.name}</th>
          <th className="w-10 pb-2 text-right font-medium">W</th>
          <th className="w-10 pb-2 text-right font-medium">L</th>
          <th className="w-14 pb-2 text-right font-medium">PCT</th>
          <th className="w-10 pb-2 text-right font-medium">GB</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id} className={`border-t border-line ${t.id === userTeamId ? 'font-semibold' : ''}`}>
            <td className="py-2">
              <span className="flex items-center gap-2">
                <TeamBadge team={t} size="sm" />
                <span className="truncate">{t.city}</span>
              </span>
            </td>
            <td className="text-right">{t.wins}</td>
            <td className="text-right">{t.losses}</td>
            <td className="text-right">{winPct(t).toFixed(3).replace(/^0/, '')}</td>
            <td className="text-right">{leader ? gamesBack(leader, t) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
