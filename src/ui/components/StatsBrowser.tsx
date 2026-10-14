import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addLine, avg, battingWar, emptyBatting, emptyPitching, era, eraPlus, fip, ipString, isPitcher, leagueRates, linesByTeam, obp, ops,
  opsPlus, per9, pitchingWar, rate3, slg, whip, woba,
  type BattingLine, type LeagueRates, type PitchingLine, type Player, type PlayerSeasonStats, type Position,
} from '../../engine';
import { useSave } from '../../state/game';
import { engine } from '../../worker/client';
import { shortName } from '../format';
import { useOpenPlayer } from '../hooks';
import { Segmented } from './Segmented';

export type StatSide = 'bat' | 'pit';

/** One row of the table: a player (possibly for one club) or a whole team. */
interface Row {
  id: string;
  label: string;
  player?: Player;
  teamIds: number[];
  position?: Position;
  bat: BattingLine;
  pit: PitchingLine;
  /** WAR, summed across the players in a team row. */
  war: number;
}

interface Column {
  key: string;
  label: string;
  title?: string;
  value: (r: Row, lg: LeagueRates) => number;
  format?: (v: number, r: Row) => string;
  /** Lower is better (ERA, WHIP, ...): sorts ascending first. */
  low?: boolean;
  /** A rate: hidden noise for tiny samples, so it needs a qualifier to lead. */
  rate?: boolean;
}

const int = (v: number) => String(Math.round(v));
const r3 = (v: number) => rate3(v);
const f2 = (v: number) => v.toFixed(2);
const f1 = (v: number) => v.toFixed(1);
const pct = (v: number) => `${(v * 100).toFixed(1)}`;

const BAT_COLUMNS: Column[] = [
  { key: 'g', label: 'G', value: (r) => r.bat.g, format: int },
  { key: 'pa', label: 'PA', value: (r) => r.bat.pa, format: int },
  { key: 'ab', label: 'AB', value: (r) => r.bat.ab, format: int },
  { key: 'r', label: 'R', value: (r) => r.bat.r, format: int },
  { key: 'h', label: 'H', value: (r) => r.bat.h, format: int },
  { key: 'd', label: '2B', value: (r) => r.bat.d, format: int },
  { key: 't', label: '3B', value: (r) => r.bat.t, format: int },
  { key: 'hr', label: 'HR', value: (r) => r.bat.hr, format: int },
  { key: 'rbi', label: 'RBI', value: (r) => r.bat.rbi, format: int },
  { key: 'bb', label: 'BB', value: (r) => r.bat.bb, format: int },
  { key: 'so', label: 'SO', value: (r) => r.bat.so, format: int },
  { key: 'sb', label: 'SB', value: (r) => r.bat.sb, format: int },
  { key: 'cs', label: 'CS', value: (r) => r.bat.cs, format: int },
  { key: 'avg', label: 'AVG', value: (r) => avg(r.bat), format: r3, rate: true },
  { key: 'obp', label: 'OBP', value: (r) => obp(r.bat), format: r3, rate: true },
  { key: 'slg', label: 'SLG', value: (r) => slg(r.bat), format: r3, rate: true },
  { key: 'ops', label: 'OPS', value: (r) => ops(r.bat), format: r3, rate: true },
  { key: 'opsplus', label: 'OPS+', title: 'OPS relative to league average (100)', value: (r, lg) => opsPlus(r.bat, lg), format: int, rate: true },
  { key: 'woba', label: 'wOBA', title: 'Weighted on-base average', value: (r) => woba(r.bat), format: r3, rate: true },
  { key: 'bbpct', label: 'BB%', value: (r) => (r.bat.pa ? r.bat.bb / r.bat.pa : 0), format: pct, rate: true },
  { key: 'kpct', label: 'K%', value: (r) => (r.bat.pa ? r.bat.so / r.bat.pa : 0), format: pct, low: true, rate: true },
  { key: 'war', label: 'WAR', title: 'Wins above replacement', value: (r) => r.war, format: f1 },
];

const PIT_COLUMNS: Column[] = [
  { key: 'g', label: 'G', value: (r) => r.pit.g, format: int },
  { key: 'gs', label: 'GS', value: (r) => r.pit.gs, format: int },
  { key: 'w', label: 'W', value: (r) => r.pit.w, format: int },
  { key: 'l', label: 'L', value: (r) => r.pit.l, format: int, low: true },
  { key: 'sv', label: 'SV', value: (r) => r.pit.sv, format: int },
  { key: 'hld', label: 'HLD', title: 'Holds', value: (r) => r.pit.hld ?? 0, format: int },
  { key: 'bs', label: 'BS', title: 'Blown saves', value: (r) => r.pit.bs ?? 0, format: int, low: true },
  { key: 'qs', label: 'QS', title: 'Quality starts: 6+ IP, 3 or fewer earned runs', value: (r) => r.pit.qs ?? 0, format: int },
  { key: 'ip', label: 'IP', value: (r) => r.pit.outs, format: (v) => ipString(v) },
  { key: 'h', label: 'H', value: (r) => r.pit.h, format: int, low: true },
  { key: 'r', label: 'R', value: (r) => r.pit.r, format: int, low: true },
  { key: 'er', label: 'ER', value: (r) => r.pit.er, format: int, low: true },
  { key: 'hr', label: 'HR', value: (r) => r.pit.hr, format: int, low: true },
  { key: 'bb', label: 'BB', value: (r) => r.pit.bb, format: int, low: true },
  { key: 'so', label: 'SO', value: (r) => r.pit.so, format: int },
  { key: 'era', label: 'ERA', value: (r) => era(r.pit), format: f2, low: true, rate: true },
  { key: 'whip', label: 'WHIP', value: (r) => whip(r.pit), format: f2, low: true, rate: true },
  { key: 'k9', label: 'K/9', value: (r) => per9(r.pit.so, r.pit), format: f1, rate: true },
  { key: 'bb9', label: 'BB/9', value: (r) => per9(r.pit.bb, r.pit), format: f1, low: true, rate: true },
  { key: 'hr9', label: 'HR/9', value: (r) => per9(r.pit.hr, r.pit), format: f1, low: true, rate: true },
  { key: 'fip', label: 'FIP', title: 'Fielding-independent pitching', value: (r, lg) => fip(r.pit, lg), format: f2, low: true, rate: true },
  { key: 'eraplus', label: 'ERA+', title: 'ERA relative to league average (100)', value: (r, lg) => eraPlus(r.pit, lg), format: int, rate: true },
  { key: 'war', label: 'WAR', title: 'Wins above replacement', value: (r) => r.war, format: f1 },
];

export const columnsFor = (side: StatSide) => (side === 'bat' ? BAT_COLUMNS : PIT_COLUMNS);

const BAT_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const PIT_POSITIONS = ['SP', 'RP'];
const PAGE = 50;

export interface StatsBrowserProps {
  side: StatSide;
  onSide: (s: StatSide) => void;
  sort: string;
  onSort: (key: string) => void;
}

/** Every player's (or team's) stats for a season, sortable and filterable. */
export function StatsBrowser({ side, onSide, sort, onSort }: StatsBrowserProps) {
  const save = useSave();
  const openPlayer = useOpenPlayer();
  const current = save.league.season;
  const seasons = useMemo(
    () => [...new Set([current, ...(save.league.history ?? []).map((h) => h.season)])].sort((a, b) => b - a),
    [current, save.league.history],
  );
  const [season, setSeason] = useState(current);
  const [phase, setPhase] = useState<'regular' | 'post'>('regular');
  const [scope, setScope] = useState<'players' | 'teams'>('players');
  const [teamFilter, setTeamFilter] = useState<number | 'all'>('all');
  const [position, setPosition] = useState('all');
  const [qualifiedOnly, setQualifiedOnly] = useState(true);
  const [desc, setDesc] = useState<boolean | null>(null);
  const [limit, setLimit] = useState(PAGE);

  // Past seasons load from storage; the current one is in the snapshot.
  const [past, setPast] = useState<{ season: number; stats: PlayerSeasonStats[] } | null>(null);
  useEffect(() => {
    if (season === current) return;
    let live = true;
    void engine().getSeasonStats(season).then((stats) => live && setPast({ season, stats }));
    return () => {
      live = false;
    };
  }, [season, current]);
  const stats = season === current ? save.stats : past?.season === season ? past.stats : null;

  const players = useMemo(() => new Map(save.players.map((p) => [p.id, p])), [save.players]);
  const teams = useMemo(() => new Map(save.teams.map((t) => [t.id, t])), [save.teams]);
  // League baselines always come from the regular season.
  const lg = useMemo(() => leagueRates(stats ?? []), [stats]);
  const teamGames = season === current
    ? Math.max(1, ...save.teams.map((t) => t.wins + t.losses))
    : save.league.settings.gamesPerSeason;

  const rows = useMemo<Row[]>(() => {
    if (!stats) return [];
    const out: Row[] = [];
    const byTeam = new Map<number, Row>();
    for (const s of stats) {
      const p = players.get(s.playerId);
      if (!p) continue;
      const pitcher = isPitcher(p);
      // Each club's share of the season (traded players appear once per club when filtering by team).
      const parts = phase === 'post'
        ? (s.post ? [{ teamId: s.teamId, bat: s.post.bat, pit: s.post.pit }] : [])
        : linesByTeam(s);
      for (const part of parts) {
        const war = pitcher ? pitchingWar(part.pit, lg) : battingWar(part.bat, p.position, lg);
        let t = byTeam.get(part.teamId);
        if (!t) {
          const team = teams.get(part.teamId);
          byTeam.set(part.teamId, (t = { id: `t${part.teamId}`, label: team ? `${team.city} ${team.name}` : '—', teamIds: [part.teamId], bat: emptyBatting(), pit: emptyPitching(), war: 0 }));
        }
        addLine(t.bat, part.bat);
        addLine(t.pit, part.pit);
        t.war += (side === 'pit') === pitcher ? war : 0;
      }
      if (side === 'bat' ? pitcher : !pitcher) continue;
      if (teamFilter !== 'all') {
        const part = parts.find((x) => x.teamId === teamFilter);
        if (!part) continue;
        out.push({
          id: `p${s.playerId}`, label: shortName(p), player: p, teamIds: [teamFilter], position: p.position, bat: part.bat, pit: part.pit,
          war: pitcher ? pitchingWar(part.pit, lg) : battingWar(part.bat, p.position, lg),
        });
      } else {
        const bat = phase === 'post' ? s.post?.bat : s.bat;
        const pit = phase === 'post' ? s.post?.pit : s.pit;
        if (!bat || !pit) continue;
        out.push({
          id: `p${s.playerId}`, label: shortName(p), player: p, teamIds: parts.map((x) => x.teamId), position: p.position, bat, pit,
          war: pitcher ? pitchingWar(pit, lg) : battingWar(bat, p.position, lg),
        });
      }
    }
    if (scope === 'teams') return [...byTeam.values()].filter((t) => (side === 'bat' ? t.bat.pa : t.pit.outs) > 0);
    return out.filter((r) => (side === 'bat' ? r.bat.pa : r.pit.bf) > 0);
  }, [stats, players, teams, lg, phase, side, scope, teamFilter]);

  const columns = columnsFor(side);
  const column = columns.find((c) => c.key === sort) ?? columns[columns.length - 1]!;
  const descending = desc ?? !column.low;
  const qualifies = (r: Row) => phase === 'post' || (side === 'bat' ? r.bat.pa >= teamGames * 3.1 : r.pit.outs >= teamGames * 3);

  const shown = useMemo(() => {
    let list = rows;
    if (scope === 'players') {
      if (position !== 'all') list = list.filter((r) => r.position === position);
      if (qualifiedOnly && column.rate) list = list.filter(qualifies);
    }
    const v = (r: Row) => column.value(r, lg);
    return [...list].sort((a, b) => (descending ? v(b) - v(a) : v(a) - v(b)));
    // qualifies depends only on side/phase/teamGames, which are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, scope, position, qualifiedOnly, column, descending, lg, side, phase, teamGames]);

  // Bring the sorted column into view on narrow screens (e.g. after "See all" from a leaderboard).
  const scroller = useRef<HTMLDivElement>(null);
  const hasRows = shown.length > 0;
  useEffect(() => {
    const box = scroller.current;
    const th = box?.querySelector<HTMLElement>('th[aria-sort]');
    const name = box?.querySelector<HTMLElement>('thead th');
    if (!box || !th || !name) return;
    const left = th.offsetLeft - name.offsetWidth;
    const right = th.offsetLeft + th.offsetWidth - box.clientWidth;
    if (box.scrollLeft > left || box.scrollLeft < right) box.scrollLeft = Math.max(0, right + box.clientWidth / 3);
  }, [column.key, side, scope, hasRows]);

  const pickSort = (key: string) => {
    if (key === sort) setDesc(!descending);
    else {
      onSort(key);
      setDesc(null);
    }
    setLimit(PAGE);
  };

  const selectClass = 'h-9 min-w-0 rounded-lg border border-line bg-surface px-2 text-sm';

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Segmented<StatSide> label="Stat type" value={side} onChange={(s) => { onSide(s); setPosition('all'); setLimit(PAGE); }}
          options={[{ value: 'bat', label: 'Batting' }, { value: 'pit', label: 'Pitching' }]} />
        <Segmented<'players' | 'teams'> label="Players or teams" value={scope} onChange={(s) => { setScope(s); setLimit(PAGE); }}
          options={[{ value: 'players', label: 'Players' }, { value: 'teams', label: 'Teams' }]} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select aria-label="Season" className={selectClass} value={season} onChange={(e) => { setSeason(Number(e.target.value)); setLimit(PAGE); }}>
          {seasons.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select aria-label="Regular season or postseason" className={selectClass} value={phase} onChange={(e) => setPhase(e.target.value as 'regular' | 'post')}>
          <option value="regular">Regular season</option>
          <option value="post">Postseason</option>
        </select>
        {scope === 'players' && (
          <>
            <select aria-label="Team" className={selectClass} value={teamFilter} onChange={(e) => { setTeamFilter(e.target.value === 'all' ? 'all' : Number(e.target.value)); setLimit(PAGE); }}>
              <option value="all">All teams</option>
              {[...teams.values()].sort((a, b) => a.city.localeCompare(b.city)).map((t) => <option key={t.id} value={t.id}>{t.city}</option>)}
            </select>
            <select aria-label="Position" className={selectClass} value={position} onChange={(e) => { setPosition(e.target.value); setLimit(PAGE); }}>
              <option value="all">All positions</option>
              {(side === 'bat' ? BAT_POSITIONS : PIT_POSITIONS).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </>
        )}
      </div>
      {scope === 'players' && phase === 'regular' && (
        <label className="mt-2 flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={qualifiedOnly} onChange={(e) => setQualifiedOnly(e.target.checked)} />
          Qualified only for rate stats ({side === 'bat' ? `${Math.round(teamGames * 3.1)} PA` : `${teamGames} IP`})
        </label>
      )}

      {!stats ? (
        <p className="py-10 text-center text-sm text-muted">Loading {season}…</p>
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{phase === 'post' ? 'No postseason games yet.' : 'No stats yet.'}</p>
      ) : (
        <div ref={scroller} className="-mx-4 mt-3 overflow-x-auto sm:mx-0 sm:rounded-xl sm:border sm:border-line">
          <table className="w-full min-w-max border-collapse text-sm tabular-nums">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="sticky left-0 z-10 bg-bg px-3 py-2 text-left font-semibold sm:bg-surface">{scope === 'teams' ? 'Team' : 'Player'}</th>
                {scope === 'players' && <th scope="col" className="px-2 py-2 text-left font-semibold">Team</th>}
                {columns.map((c) => (
                  <th key={c.key} scope="col" className="px-0 py-0 text-right font-semibold" aria-sort={c.key === column.key ? (descending ? 'descending' : 'ascending') : undefined}>
                    <button onClick={() => pickSort(c.key)} title={c.title} className={`w-full px-2 py-2 text-right ${c.key === column.key ? 'text-accent' : ''}`}>
                      {c.label}{c.key === column.key ? (descending ? ' ↓' : ' ↑') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, limit).map((r, i) => {
                const mine = r.teamIds.includes(save.meta.userTeamId);
                return (
                <tr key={r.id} className={`border-b border-line/60 ${mine ? 'bg-surface-2' : ''}`}>
                  <th scope="row" className={`sticky left-0 z-10 max-w-[10rem] px-3 py-1.5 text-left font-medium ${mine ? 'bg-surface-2' : 'bg-bg sm:bg-surface'}`}>
                    {r.player ? (
                      <button onClick={() => openPlayer(r.player!.id)} className="block w-full truncate text-left hover:underline">
                        <span className="mr-1.5 inline-block w-5 text-right text-xs text-muted">{i + 1}</span>{r.label}
                      </button>
                    ) : (
                      <span className="block truncate"><span className="mr-1.5 inline-block w-5 text-right text-xs text-muted">{i + 1}</span>{r.label}</span>
                    )}
                  </th>
                  {scope === 'players' && (
                    <td className="px-2 py-1.5 text-left text-xs text-muted">
                      {r.teamIds.length > 1 ? `${r.teamIds.length} tms` : teams.get(r.teamIds[0]!)?.abbr ?? '—'}
                      <span className="ml-1">{r.position}</span>
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={`px-2 py-1.5 text-right ${c.key === column.key ? 'font-semibold' : ''}`}>
                      {(c.format ?? int)(c.value(r, lg), r)}
                    </td>
                  ))}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {shown.length > limit && (
        <button onClick={() => setLimit(limit + PAGE)} className="mt-2 h-10 w-full rounded-lg text-sm font-medium text-accent hover:bg-surface-2">
          Show more ({shown.length - limit})
        </button>
      )}
    </div>
  );
}


