import { roundName, type PlayoffSeries, type PlayoffState, type Team } from '../../engine';
import { TeamBadge } from './TeamBadge';

function SeriesCard({ s, teams, userTeamId }: { s: PlayoffSeries; teams: Map<number, Team>; userTeamId: number }) {
  const rows = [
    { id: s.highId, seed: s.highSeed, wins: s.highWins },
    { id: s.lowId, seed: s.lowSeed, wins: s.lowWins },
  ];
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{roundName(s)} · best of {s.bestOf}</p>
      {rows.map((r, i) => {
        const t = r.id !== null ? teams.get(r.id) : undefined;
        const lost = s.winnerId !== null && s.winnerId !== r.id;
        return (
          <div key={i} className={`flex items-center gap-2 py-1 ${lost ? 'opacity-45' : ''} ${r.id === userTeamId ? 'font-semibold' : ''}`}>
            {t ? <TeamBadge team={t} size="sm" /> : <span className="size-7 rounded-xl bg-surface-2" />}
            <span className="min-w-0 flex-1 truncate text-sm">{t ? t.city : 'TBD'}</span>
            <span className="text-lg font-bold tabular-nums">{t ? r.wins : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Bracket({ playoffs, teams, userTeamId }: { playoffs: PlayoffState; teams: Team[]; userTeamId: number }) {
  const map = new Map(teams.map((t) => [t.id, t]));
  const rounds = [...new Set(playoffs.series.map((s) => s.round))].sort((a, b) => a - b);
  const champ = playoffs.championId !== null ? map.get(playoffs.championId) : undefined;
  return (
    <div>
      {champ && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl p-4 text-white" style={{ background: `linear-gradient(135deg, ${champ.primaryColor}, ${champ.secondaryColor})` }}>
          <TeamBadge team={champ} />
          <div>
            <p className="text-xs uppercase tracking-wide opacity-80">Champions</p>
            <p className="text-lg font-bold">{champ.city} {champ.name}</p>
          </div>
        </div>
      )}
      <div className="grid gap-4 md:grid-flow-col md:auto-cols-fr">
        {rounds.map((r) => (
          <div key={r} className="flex flex-col justify-around gap-3">
            {playoffs.series.filter((s) => s.round === r).map((s) => <SeriesCard key={s.id} s={s} teams={map} userTeamId={userTeamId} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
