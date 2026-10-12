import type { ScheduledGame, Team } from '../../engine';
import { TeamBadge } from './TeamBadge';

/** A game from one team's perspective: date, opponent, result. */
export function GameRow({ game, teamId, teams, onOpen }: { game: ScheduledGame; teamId: number; teams: Map<number, Team>; onOpen?: (id: number) => void }) {
  const home = game.homeId === teamId;
  const opp = teams.get(home ? game.awayId : game.homeId)!;
  const d = new Date(`${game.date}T12:00:00`);
  const us = home ? game.homeScore : game.awayScore;
  const them = home ? game.awayScore : game.homeScore;
  const won = game.played && us! > them!;
  const content = (
    <>
      <span className="w-12 shrink-0 text-xs text-muted tabular-nums">
        {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </span>
      <span className="w-5 shrink-0 text-xs text-muted">{home ? 'vs' : '@'}</span>
      <TeamBadge team={opp} size="sm" />
      <span className="min-w-0 flex-1 truncate font-medium">{opp.city}</span>
      {game.played ? (
        <span className="tabular-nums">
          <span className={`mr-2 inline-block w-4 text-center font-bold ${won ? 'text-accent' : 'text-danger'}`}>{won ? 'W' : 'L'}</span>
          {us}–{them}
          {game.innings! > 9 && <span className="text-xs text-muted"> ({game.innings})</span>}
        </span>
      ) : (
        <span className="text-xs text-muted">Upcoming</span>
      )}
    </>
  );
  const cls = 'flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm';
  return game.played && onOpen ? (
    <button onClick={() => onOpen(game.id)} className={`${cls} hover:bg-surface-2`}>{content}</button>
  ) : (
    <div className={cls}>{content}</div>
  );
}

/** Neutral scoreboard tile for league-wide scores. */
export function ScoreTile({ game, teams, onOpen }: { game: ScheduledGame; teams: Map<number, Team>; onOpen: (id: number) => void }) {
  const rows = [
    { t: teams.get(game.awayId)!, r: game.awayScore ?? 0 },
    { t: teams.get(game.homeId)!, r: game.homeScore ?? 0 },
  ];
  const max = Math.max(rows[0]!.r, rows[1]!.r);
  return (
    <button onClick={() => onOpen(game.id)} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-3 text-left hover:border-muted">
      {rows.map(({ t, r }) => (
        <span key={t.id} className={`flex items-center gap-2 ${r === max ? 'font-semibold' : 'text-muted'}`}>
          <TeamBadge team={t} size="sm" />
          <span className="flex-1 truncate text-sm">{t.city}</span>
          <span className="tabular-nums">{r}</span>
        </span>
      ))}
      <span className="text-[11px] uppercase tracking-wide text-muted">Final{game.innings! > 9 ? `/${game.innings}` : ''}</span>
    </button>
  );
}
