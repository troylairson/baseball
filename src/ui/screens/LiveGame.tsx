import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  avg, era, ipString, isPitcher, ops, rate3, whip, type LiveCommand, type LiveSituation, type PlayEvent, type Player, type PlayerSeasonStats, type Team,
} from '../../engine';
import { AnimatedField } from '../field/AnimatedField';
import type { Speed } from '../field/director';
import { useStatsMap } from '../stats';
import { useGame, useSave, useUserTeam } from '../../state/game';
import type { LiveState } from '../../worker/api';
import { engine } from '../../worker/client';
import { BottomSheet } from '../components/BottomSheet';
import { Icon } from '../components/Icon';
import { RatingBadge } from '../components/Rating';
import { TeamBadge } from '../components/TeamBadge';
import { fullName, shortName } from '../format';
import { useOpenGame } from '../hooks';
import { scoutedOverall } from '../scouting';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

const SPEED_KEY = 'dgm.fieldSpeed';

function initialSpeed(): Speed {
  try {
    const saved = localStorage.getItem(SPEED_KEY);
    if (saved === 'pitch' || saved === 'play' || saved === 'instant') return saved;
  } catch { /* storage unavailable */ }
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'play';
}

export function LiveGame() {
  const [state, setState] = useState<LiveState | null>(null);
  const [busy, setBusy] = useState(false);
  // What the screen shows lags the engine while a play animates.
  const [shown, setShown] = useState<LiveState | null>(null);
  const [queue, setQueue] = useState<PlayEvent[]>([]);
  const [speed, setSpeedState] = useState<Speed>(initialSpeed);
  const setSpeed = (s: Speed) => {
    setSpeedState(s);
    try { localStorage.setItem(SPEED_KEY, s); } catch { /* storage unavailable */ }
  };

  // Live results (and any days simmed to reach the game) update the career snapshot.
  const apply = useCallback((s: LiveState, animate = true) => {
    if (s.save) useGame.setState({ save: s.save });
    setState(s);
    const events = s.status === 'live' ? s.situation.events : s.status === 'final' ? s.events ?? [] : [];
    const plays = events.filter((e) => e.kind !== 'pinchHit');
    if (animate && plays.length) {
      setQueue(plays);
    } else {
      setQueue([]);
      setShown(s);
    }
  }, []);
  const settle = useCallback(() => {
    setQueue([]);
    setShown(state);
  }, [state]);

  useEffect(() => {
    let live = true;
    engine().liveStart().then((s) => live && apply(s, false));
    return () => {
      live = false;
    };
  }, [apply]);

  const run = async (fn: () => Promise<LiveState>, animate = true) => {
    setBusy(true);
    apply(await fn(), animate);
    setBusy(false);
  };

  // Keep the field on screen while the game-ending play animates.
  const view = queue.length && shown?.status === 'live' ? shown : state;
  if (!state || !view) return <p className="py-20 text-center text-muted">Heading to the ballpark…</p>;
  if (view.status === 'none' && state.status === 'none') {
    return (
      <div className="py-16 text-center">
        <p className="font-semibold">{state.reason}</p>
        <Link to="/play/home" className="mt-4 inline-block text-sm font-medium text-accent">Back to Home</Link>
      </div>
    );
  }
  if (view.status !== 'live') return state.status === 'final' ? <Final gameId={state.gameId} /> : null;
  return (
    <Live
      s={view.situation}
      awayId={view.awayId}
      homeId={view.homeId}
      busy={busy || queue.length > 0}
      queue={queue}
      speed={speed}
      setSpeed={setSpeed}
      onPlayed={settle}
      command={(cmd) => void run(() => engine().liveCommand(cmd))}
      simInning={() => void run(() => engine().liveSimInning(), false)}
      finish={() => void run(() => engine().liveFinish(), false)}
    />
  );
}

function Live({
  s, awayId, homeId, busy, queue, speed, setSpeed, onPlayed, command, simInning, finish,
}: {
  s: LiveSituation; awayId: number; homeId: number; busy: boolean;
  queue: PlayEvent[]; speed: Speed; setSpeed: (s: Speed) => void; onPlayed: () => void;
  command: (c: LiveCommand) => void; simInning: () => void; finish: () => void;
}) {
  const save = useSave();
  const team = useUserTeam();
  const [sheet, setSheet] = useState<'pinch' | 'pitcher' | null>(null);
  const teams = new Map(save.teams.map((t) => [t.id, t]));
  const players = new Map(save.players.map((p) => [p.id, p]));
  const away = teams.get(awayId)!;
  const home = teams.get(homeId)!;
  const batter = players.get(s.batterId)!;
  const pitcher = players.get(s.pitcherId)!;
  const [on1, on2, on3] = s.bases;
  const canSteal = s.userBatting && on1 !== null && on2 === null && s.outs < 2;
  const canBunt = s.userBatting && (on1 !== null || on2 !== null) && on3 === null && s.outs < 2;
  const plays = s.log.filter((l) => !/^(Top|Bottom) /.test(l)).slice(-5).reverse();
  const names = new Map([...players.values()].filter((p) => p.teamId === awayId || p.teamId === homeId).map((p) => [p.id, p.lastName]));
  const battingTeam = s.half === 'top' ? away : home;
  const fieldingTeam = s.half === 'top' ? home : away;

  const btn = 'h-11 rounded-xl border border-line bg-surface px-3 text-sm font-semibold hover:bg-surface-2 disabled:opacity-40';

  return (
    <div className="mx-auto max-w-xl">
      {/* Scoreboard */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <ScoreSide team={away} runs={s.awayRuns} hits={s.awayHits} batting={s.half === 'top'} />
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{s.half === 'top' ? '▲' : '▼'} {ordinal(s.inning)}</p>
            <div className="mt-1 flex justify-center gap-1" aria-label={`${s.outs} outs`}>
              {[0, 1, 2].map((i) => <span key={i} className={`size-2.5 rounded-full ${i < s.outs ? 'bg-ink' : 'bg-line'}`} />)}
            </div>
          </div>
          <ScoreSide team={home} runs={s.homeRuns} hits={s.homeHits} batting={s.half === 'bottom'} right />
        </div>
        <Linescore away={away} home={home} a={s.awayInnings} h={s.homeInnings} />
      </section>

      {/* Field + matchup */}
      <section className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
        <AnimatedField
          fieldingColor={fieldingTeam.primaryColor}
          battingColor={battingTeam.primaryColor}
          names={names}
          bases={s.bases}
          batterId={s.batterId}
          queue={queue}
          speed={speed}
          onDone={onPlayed}
          aside={
            <select
              aria-label="Animation speed"
              value={speed}
              onChange={(e) => setSpeed(e.target.value as Speed)}
              className="h-8 shrink-0 rounded-lg border border-line bg-surface px-2 text-xs font-medium"
            >
              <option value="pitch">Every pitch</option>
              <option value="play">Each play</option>
              <option value="instant">Instant</option>
            </select>
          }
        />
      </section>
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <Matchup label="At bat" p={batter} userTeamId={team.id}
            detail={`${s.batterLine.h}-${s.batterLine.ab} today${s.batterLine.hr ? `, ${s.batterLine.hr} HR` : ''}${s.batterLine.bb ? `, ${s.batterLine.bb} BB` : ''}`} />
          <Matchup label="Pitching" p={pitcher} userTeamId={team.id}
            detail={`${ipString(s.pitcherLine.outs)} IP, ${s.pitcherLine.so} K · ${s.pitcherPitches} pitches`} />
        </div>
      </section>

      {/* Recent plays */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Last plays</h2>
        {plays.length === 0 ? <p className="text-sm text-muted">Play ball!</p> : (
          <ol className="space-y-1 text-sm">
            {plays.map((l, i) => <li key={i} className={i === 0 ? 'font-medium' : 'text-muted'}>{l.trim()}</li>)}
          </ol>
        )}
      </section>

      {/* Manager controls */}
      <section className="pb-safe sticky bottom-20 z-20 mt-3 rounded-2xl border border-line bg-surface p-3 shadow-lg md:bottom-4">
        <div className="grid grid-cols-3 gap-2 [&>button]:h-9 [&>button]:text-xs">
          {s.userBatting ? (
            <>
              <button className={btn} disabled={busy || !canSteal} onClick={() => command({ type: 'steal' })}>Steal</button>
              <button className={btn} disabled={busy || !canBunt} onClick={() => command({ type: 'bunt' })}>Bunt</button>
              <button className={btn} disabled={busy || s.bench.length === 0} onClick={() => setSheet('pinch')}>Pinch hit</button>
            </>
          ) : (
            <>
              <button className={btn} disabled={busy} onClick={() => command({ type: 'ibb' })}>Walk him</button>
              <button className={`${btn} col-span-2`} disabled={busy || s.bullpen.length === 0} onClick={() => setSheet('pitcher')}>Pitching change</button>
            </>
          )}
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
          <button
            onClick={() => command({ type: s.userBatting ? 'swing' : 'auto' })}
            disabled={busy}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-accent-contrast disabled:opacity-60"
          >
            <Icon name="play" className="size-4" /> {s.userBatting ? 'Swing away' : 'Pitch to him'}
          </button>
          <button className={`${btn} text-xs`} disabled={busy} onClick={simInning} aria-label="Sim half-inning">Sim ½ inn</button>
          <button className={`${btn} text-xs`} disabled={busy} onClick={finish} aria-label="Sim to end">Sim game</button>
        </div>
      </section>

      <PickSheet
        open={sheet !== null}
        title={sheet === 'pinch' ? `Pinch hit for ${shortName(batter)}` : `Replace ${shortName(pitcher)}`}
        ids={sheet === 'pinch' ? s.bench : s.bullpen}
        players={players}
        userTeamId={team.id}
        onClose={() => setSheet(null)}
        onPick={(id) => {
          setSheet(null);
          command(sheet === 'pinch' ? { type: 'pinchHit', playerId: id } : { type: 'pitchingChange', playerId: id });
        }}
      />
    </div>
  );
}

function ScoreSide({ team, runs, hits, batting, right }: { team: Team; runs: number; hits: number; batting: boolean; right?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <TeamBadge team={team} />
      <div>
        <p className="text-3xl font-bold tabular-nums leading-none">{runs}</p>
        <p className={`text-[11px] ${batting ? 'font-semibold text-accent' : 'text-muted'}`}>{team.abbr} · {hits} H</p>
      </div>
    </div>
  );
}

function Linescore({ away, home, a, h }: { away: Team; home: Team; a: number[]; h: number[] }) {
  const n = Math.max(9, a.length, h.length);
  const cols = Array.from({ length: n }, (_, i) => i);
  return (
    <div className="-mx-4 mt-3 overflow-x-auto px-4">
      <table className="w-full min-w-max text-center text-xs tabular-nums text-muted">
        <thead><tr><th className="w-10" />{cols.map((i) => <th key={i} className="w-6 font-medium">{i + 1}</th>)}</tr></thead>
        <tbody>
          {[{ t: away, r: a }, { t: home, r: h }].map(({ t, r }) => (
            <tr key={t.id}>
              <td className="text-left font-semibold text-ink">{t.abbr}</td>
              {cols.map((i) => <td key={i}>{r[i] ?? ''}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Season line for the live view: hitters' slash stats, pitchers' run prevention. */
function seasonLine(p: Player, s: PlayerSeasonStats | undefined): string {
  if (isPitcher(p)) {
    if (!s || !s.pit.outs) return 'No innings yet this season';
    return `${era(s.pit).toFixed(2)} ERA · ${whip(s.pit).toFixed(2)} WHIP · ${s.pit.w}-${s.pit.l}${s.pit.sv ? `, ${s.pit.sv} SV` : ''}`;
  }
  if (!s || !s.bat.pa) return 'No at-bats yet this season';
  return `${rate3(avg(s.bat))} AVG · ${rate3(ops(s.bat))} OPS · ${s.bat.hr} HR`;
}

function Matchup({ label, p, detail, userTeamId }: { label: string; p: Player; detail: string; userTeamId: number }) {
  const { ovr } = scoutedOverall(p, userTeamId);
  const stats = useStatsMap();
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
        <p className="truncate font-semibold">{fullName(p)}</p>
        <p className="truncate text-xs text-muted">{detail}</p>
        <p className="text-xs font-medium tabular-nums">{seasonLine(p, stats.get(p.id))}</p>
      </div>
      <RatingBadge value={ovr} size="sm" />
    </div>
  );
}

function PickSheet({
  open, title, ids, players, userTeamId, onPick, onClose,
}: { open: boolean; title: string; ids: number[]; players: Map<number, Player>; userTeamId: number; onPick: (id: number) => void; onClose: () => void }) {
  const stats = useStatsMap();
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <h2 className="mb-3 pr-10 text-xl font-bold">{title}</h2>
      <ul className="-mx-2">
        {ids.map((id) => {
          const p = players.get(id)!;
          const tired = isPitcher(p) && p.fatigue >= 40;
          return (
            <li key={id}>
              <button onClick={() => onPick(id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2">
                <span className="w-8 text-center text-xs font-bold text-muted">{p.position}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{fullName(p)}</span>
                  <span className="block truncate text-xs text-muted">
                    {isPitcher(p) ? `Throws ${p.throws}${tired ? ' · tired' : ''}` : `Bats ${p.bats}`} · {seasonLine(p, stats.get(id))}
                  </span>
                </span>
                <RatingBadge value={scoutedOverall(p, userTeamId).ovr} size="sm" />
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}

function Final({ gameId }: { gameId: number }) {
  const save = useSave();
  const team = useUserTeam();
  const openGame = useOpenGame();
  const g = save.schedule.find((x) => x.id === gameId);
  if (!g) return null;
  const teams = new Map(save.teams.map((t) => [t.id, t]));
  const mine = g.homeId === team.id ? g.homeScore! : g.awayScore!;
  const theirs = g.homeId === team.id ? g.awayScore! : g.homeScore!;
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <p className="text-sm uppercase tracking-wide text-muted">Final{g.innings! > 9 ? ` / ${g.innings}` : ''}</p>
      <div className="my-4 flex items-center justify-center gap-6">
        {[teams.get(g.awayId)!, teams.get(g.homeId)!].map((t) => (
          <div key={t.id} className="flex flex-col items-center gap-2">
            <TeamBadge team={t} size="lg" />
            <span className="text-4xl font-bold tabular-nums">{t.id === g.homeId ? g.homeScore : g.awayScore}</span>
          </div>
        ))}
      </div>
      <p className={`text-xl font-bold ${mine > theirs ? 'text-accent' : 'text-danger'}`}>{mine > theirs ? 'You win!' : 'Tough loss.'}</p>
      <div className="mt-6 grid gap-2">
        <button onClick={() => openGame(gameId)} className="h-12 rounded-xl border border-line font-semibold hover:bg-surface-2">Box score</button>
        <Link to="/play/home" className="flex h-12 items-center justify-center rounded-xl bg-accent font-semibold text-accent-contrast">Back to Home</Link>
      </div>
    </div>
  );
}
