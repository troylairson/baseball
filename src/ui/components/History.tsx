import type { Player, SeasonRecord, Team } from '../../engine';
import { shortName } from '../format';
import { useOpenPlayer } from '../hooks';
import { Card } from './Card';
import { TeamBadge } from './TeamBadge';

export function HistoryList({ history, teams, players, userTeamId }: { history: SeasonRecord[]; teams: Team[]; players: Player[]; userTeamId: number }) {
  const openPlayer = useOpenPlayer();
  const tm = new Map(teams.map((t) => [t.id, t]));
  const pm = new Map(players.map((p) => [p.id, p]));
  if (history.length === 0) {
    return <p className="py-16 text-center text-sm text-muted">Finish a season to start the record books.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[...history].reverse().map((h) => {
        const champ = h.championId !== null ? tm.get(h.championId) : undefined;
        const mine = h.standings.find((s) => s.teamId === userTeamId);
        return (
          <Card key={h.season} title={String(h.season)}>
            {champ && (
              <div className="mb-3 flex items-center gap-3">
                <TeamBadge team={champ} />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Champion</p>
                  <p className="font-semibold">{champ.city} {champ.name}</p>
                </div>
              </div>
            )}
            <ul className="space-y-1 text-sm">
              {h.awards.map((a) => {
                const p = pm.get(a.playerId);
                return (
                  <li key={a.name} className="flex gap-2">
                    <span className="w-24 shrink-0 text-muted">{a.name.replace(' Award', '').replace('Most Valuable Player', 'MVP')}</span>
                    <button onClick={() => p && openPlayer(p.id)} className="truncate text-left font-medium hover:underline">{p ? shortName(p) : '—'}</button>
                  </li>
                );
              })}
            </ul>
            {mine && <p className="mt-3 text-xs text-muted">Your team: {mine.wins}–{mine.losses}</p>}
          </Card>
        );
      })}
    </div>
  );
}
