import { useEffect, useState } from 'react';
import type { BoxScore } from '../../db/db';
import { avg, ipString, rate3, type Player, type Team, type TeamBox } from '../../engine';
import { useGame } from '../../state/game';
import { engine } from '../../worker/client';
import { BottomSheet } from '../components/BottomSheet';
import { TeamBadge } from '../components/TeamBadge';
import { formatDate, shortName } from '../format';
import { useOpenPlayer } from '../hooks';
import { useStatsMap } from '../stats';

export function BoxScoreSheet({ gameId, onClose }: { gameId: number | null; onClose: () => void }) {
  const [box, setBox] = useState<{ id: number; data: BoxScore | null } | null>(null);
  const current = box && box.id === gameId ? box.data : undefined;

  useEffect(() => {
    if (gameId === null) return;
    let live = true;
    engine().getBoxScore(gameId).then((data) => live && setBox({ id: gameId, data }));
    return () => {
      live = false;
    };
  }, [gameId]);

  return (
    <BottomSheet open={gameId !== null} onClose={onClose} title="Box score">
      {current === undefined ? (
        <p className="py-10 text-center text-muted">Loading…</p>
      ) : current === null ? (
        <p className="py-10 text-center text-muted">Box score not available.</p>
      ) : (
        <BoxScoreView box={current} />
      )}
    </BottomSheet>
  );
}

function BoxScoreView({ box }: { box: BoxScore }) {
  const save = useGame((s) => s.save)!;
  const teams = new Map(save.teams.map((t) => [t.id, t]));
  const players = new Map(save.players.map((p) => [p.id, p]));
  const { result } = box;
  const away = teams.get(result.away.teamId)!;
  const home = teams.get(result.home.teamId)!;
  const [showLog, setShowLog] = useState(false);
  const decision = (id: number) =>
    id === result.winningPitcher ? 'W' : id === result.losingPitcher ? 'L' : id === result.savePitcher ? 'S' : '';

  return (
    <div>
      <p className="pr-10 text-sm text-muted">{formatDate(box.date)}{result.innings > 9 ? ` · ${result.innings} innings` : ''}</p>
      <div className="mt-3 flex flex-col gap-2">
        {[{ t: away, b: result.away }, { t: home, b: result.home }].map(({ t, b }) => (
          <div key={t.id} className="flex items-center gap-3">
            <TeamBadge team={t} size="sm" />
            <span className={`flex-1 font-semibold ${b.runs > (b === result.away ? result.home : result.away).runs ? '' : 'text-muted'}`}>
              {t.city} {t.name}
            </span>
            <span className="text-2xl font-bold tabular-nums">{b.runs}</span>
          </div>
        ))}
      </div>

      <Linescore away={away} home={home} a={result.away} h={result.home} innings={result.innings} />

      {[{ t: away, b: result.away }, { t: home, b: result.home }].map(({ t, b }) => (
        <TeamTables key={t.id} team={t} box={b} players={players} decision={decision} />
      ))}

      {result.log.length > 0 && (
        <section className="mt-6">
          <button onClick={() => setShowLog((v) => !v)} className="h-11 w-full rounded-xl border border-line text-sm font-medium hover:bg-surface-2">
            {showLog ? 'Hide' : 'Show'} play-by-play
          </button>
          {showLog && (
            <ol className="mt-3 space-y-1 text-sm">
              {result.log.map((line, i) =>
                /^(Top|Bottom) /.test(line) ? (
                  <li key={i} className="pt-3 text-xs font-semibold uppercase tracking-wide text-muted">{line}</li>
                ) : (
                  <li key={i} className={line.startsWith('  ') ? 'pl-4 text-muted' : ''}>{line.trim()}</li>
                ),
              )}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}

function Linescore({ away, home, a, h, innings }: { away: Team; home: Team; a: TeamBox; h: TeamBox; innings: number }) {
  const cols = Array.from({ length: Math.max(9, innings) }, (_, i) => i);
  const cell = (box: TeamBox, i: number) => (i < box.innings.length ? box.innings[i] : i < innings ? 'X' : '');
  return (
    <div className="-mx-4 mt-5 overflow-x-auto px-4 md:-mx-6 md:px-6">
      <table className="w-full min-w-max text-center text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-muted">
            <th className="sticky left-0 bg-surface pr-3 text-left font-medium" />
            {cols.map((i) => <th key={i} className="w-7 font-medium">{i + 1}</th>)}
            <th className="w-8 pl-2 font-semibold">R</th>
            <th className="w-8 font-semibold">H</th>
            <th className="w-8 font-semibold">E</th>
          </tr>
        </thead>
        <tbody>
          {[{ t: away, b: a }, { t: home, b: h }].map(({ t, b }) => (
            <tr key={t.id} className="border-t border-line">
              <td className="sticky left-0 bg-surface py-1.5 pr-3 text-left font-semibold">{t.abbr}</td>
              {cols.map((i) => <td key={i}>{cell(b, i)}</td>)}
              <td className="pl-2 font-bold">{b.runs}</td>
              <td className="font-semibold">{b.hits}</td>
              <td className="font-semibold">{b.errors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamTables({
  team, box, players, decision,
}: { team: Team; box: TeamBox; players: Map<number, Player>; decision: (id: number) => string }) {
  const openPlayer = useOpenPlayer();
  const stats = useStatsMap();
  const th = 'pb-1.5 text-right font-medium';
  const nameCell = (id: number, extra: string) => {
    const p = players.get(id);
    return (
      <td className="sticky left-0 bg-surface py-1.5 pr-2 text-left">
        <button onClick={() => openPlayer(id)} className="font-medium hover:underline">{p ? shortName(p) : '—'}</button>
        <span className="ml-1 text-xs text-muted">{extra}</span>
      </td>
    );
  };
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{team.city} {team.name}</h3>
      <div className="-mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6">
        <table className="w-full min-w-[22rem] text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-muted">
              <th className="sticky left-0 bg-surface pb-1.5 text-left font-medium">Batting</th>
              <th className={th}>AB</th><th className={th}>R</th><th className={th}>H</th><th className={th}>RBI</th>
              <th className={th}>BB</th><th className={th}>SO</th><th className={th}>AVG</th>
            </tr>
          </thead>
          <tbody>
            {box.batters.map((b) => (
              <tr key={b.playerId} className="border-t border-line">
                {nameCell(b.playerId, b.position)}
                <td className="text-right">{b.line.ab}</td>
                <td className="text-right">{b.line.r}</td>
                <td className="text-right">{b.line.h}</td>
                <td className="text-right">{b.line.rbi}</td>
                <td className="text-right">{b.line.bb}</td>
                <td className="text-right">{b.line.so}</td>
                <td className="text-right text-muted">{rate3(avg(stats.get(b.playerId)?.bat ?? b.line))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="mt-4 w-full min-w-[22rem] text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-muted">
              <th className="sticky left-0 bg-surface pb-1.5 text-left font-medium">Pitching</th>
              <th className={th}>IP</th><th className={th}>H</th><th className={th}>R</th><th className={th}>ER</th>
              <th className={th}>BB</th><th className={th}>SO</th><th className={th}>PC</th>
            </tr>
          </thead>
          <tbody>
            {box.pitchers.map((p) => (
              <tr key={p.playerId} className="border-t border-line">
                {nameCell(p.playerId, decision(p.playerId))}
                <td className="text-right">{ipString(p.line.outs)}</td>
                <td className="text-right">{p.line.h}</td>
                <td className="text-right">{p.line.r}</td>
                <td className="text-right">{p.line.er}</td>
                <td className="text-right">{p.line.bb}</td>
                <td className="text-right">{p.line.so}</td>
                <td className="text-right text-muted">{p.line.pitches}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
