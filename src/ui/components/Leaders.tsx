import type { Player, PlayerSeasonStats, Team } from '../../engine';
import { shortName } from '../format';
import { useOpenPlayer } from '../hooks';
import { leaders, useLeagueRates, type Leader } from '../stats';
import { Card } from './Card';
import { TeamBadge } from './TeamBadge';

export function LeaderBoard({
  leader, stats, players, teams, teamGames, onSeeAll,
}: {
  leader: Leader; stats: PlayerSeasonStats[]; players: Map<number, Player>; teams: Map<number, Team>; teamGames: number;
  /** Opens the full stats table sorted by this category. */
  onSeeAll?: () => void;
}) {
  const openPlayer = useOpenPlayer();
  const lg = useLeagueRates();
  const ctxFor = (s: PlayerSeasonStats) => ({ lg, player: players.get(s.playerId) });
  const top = leaders(stats, leader, teamGames, ctxFor);
  return (
    <Card title={leader.label}>
      {top.length === 0 ? (
        <p className="text-sm text-muted">No qualified players yet.</p>
      ) : (
        <ol className="-mx-2">
          {top.map((s, i) => {
            const p = players.get(s.playerId);
            const t = p?.teamId != null ? teams.get(p.teamId) : undefined;
            return (
              <li key={s.playerId}>
                <button onClick={() => openPlayer(s.playerId)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2">
                  <span className="w-4 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                  {t && <TeamBadge team={t} size="sm" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p ? shortName(p) : '—'}</span>
                  <span className="text-sm font-semibold tabular-nums">{leader.format(s, ctxFor(s))}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {onSeeAll && top.length > 0 && (
        <button onClick={onSeeAll} className="mt-1 h-9 w-full rounded-lg text-sm font-medium text-accent hover:bg-surface-2">
          See all
        </button>
      )}
    </Card>
  );
}
