import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  avg, defenseAt, era, stealTarget, isPitcher, ops, rate3, whip, type Decision, type FieldPosition, type LiveCommand, type LiveSituation, type PlayEvent, type Player, type PlayerSeasonStats, type Team,
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
import { MatchupPanel } from '../components/Matchup';
import { DecisionCard, OrdersSheet } from '../components/LiveAssist';
import { TeamBadge } from '../components/TeamBadge';
import { fullName, shortName } from '../format';
import { useOpenGame } from '../hooks';
import { scouted, scoutedOverall } from '../scouting';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

const SPEED_KEY = 'dgm.fieldSpeed';
const AUTO_KEY = 'dgm.liveAutoplay';

function initialAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1';
  } catch {
    return false;
  }
}

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

  // Autoplay: one batter at a time at the animation's pace, pausing whenever there's a decision.
  const [auto, setAutoState] = useState(initialAuto);
  const setAuto = (v: boolean) => {
    setAutoState(v);
    try { localStorage.setItem(AUTO_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
  };
  const waiting = state?.status === 'live' && !!state.decision;
  useEffect(() => {
    if (!auto || busy || queue.length || state?.status !== 'live' || waiting) return;
    const t = setTimeout(() => void run(() => engine().liveCommand({ type: 'auto' })), speed === 'instant' ? 700 : 350);
    return () => clearTimeout(t);
    // run is recreated each render; the state it needs is in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, busy, queue.length, state, waiting, speed]);

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
      advance={() => void run(() => engine().liveAdvance())}
      simInning={() => void run(() => engine().liveSimInning(), false)}
      finish={() => void run(() => engine().liveFinish(), false)}
      decision={state.status === 'live' ? state.decision ?? null : null}
      skipped={state.status === 'live' ? state.skipped : undefined}
      auto={auto}
      setAuto={setAuto}
    />
  );
}

function Live({
  s, awayId, homeId, busy, queue, speed, setSpeed, onPlayed, command, advance, simInning, finish, decision, skipped, auto, setAuto,
}: {
  s: LiveSituation; awayId: number; homeId: number; busy: boolean;
  queue: PlayEvent[]; speed: Speed; setSpeed: (s: Speed) => void; onPlayed: () => void;
  command: (c: LiveCommand) => void; advance: () => void; simInning: () => void; finish: () => void;
  decision: Decision | null; skipped?: number; auto: boolean; setAuto: (v: boolean) => void;
}) {
  const save = useSave();
  const team = useUserTeam();
  const [sheet, setSheet] = useState<'pinch' | 'pitcher' | 'orders' | null>(null);
  const teams = new Map(save.teams.map((t) => [t.id, t]));
  const players = new Map(save.players.map((p) => [p.id, p]));
  const away = teams.get(awayId)!;
  const home = teams.get(homeId)!;
  const batter = players.get(s.batterId)!;
  const pitcher = players.get(s.pitcherId)!;
  const [on1, on2, on3] = s.bases;
  // The lead runner with an open base ahead of him can go (with a runner on first and second, both run).
  const stealTo = stealTarget(s.bases);
  const canSteal = s.userBatting && stealTo !== null;
  const stealLabel = stealTo === 3 ? (on1 !== null ? 'Double steal' : 'Steal 3rd') : stealTo === 2 ? 'Steal 2nd' : 'Steal';
  const canBunt = s.userBatting && (on1 !== null || on2 !== null) && on3 === null && s.outs < 2;
  const plays = s.log.filter((l) => !/^(Top|Bottom) /.test(l)).slice(-5).reverse();
  const names = new Map([...players.values()].filter((p) => p.teamId === awayId || p.teamId === homeId).map((p) => [p.id, p.lastName]));
  const battingTeam = s.half === 'top' ? away : home;
  const fieldingTeam = s.half === 'top' ? home : away;

  const btn = 'h-11 rounded-xl border border-line bg-surface px-3 text-sm font-semibold hover:bg-surface-2 disabled:opacity-40';
  const accept = () => decision?.suggestion && command(decision.suggestion.command);
  const nextBatter = () => command({ type: 'auto' });

  // Keyboard shortcuts (desktop): the common calls without the mouse.
  const keys = useRef({ accept, advance, nextBatter, command, canSteal, canBunt, s, busy, sheet, auto, setAuto, decision });
  useEffect(() => {
    keys.current = { accept, advance, nextBatter, command, canSteal, canBunt, s, busy, sheet, auto, setAuto, decision };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || k.sheet || target?.closest('input, select, textarea, [role=dialog]')) return;
      const key = e.key.toLowerCase();
      if (key === 'a') return void k.setAuto(!k.auto);
      if (k.busy) return;
      const map: Record<string, () => void> = {
        ' ': k.advance,
        enter: () => (k.decision?.suggestion ? k.accept() : k.advance()),
        n: k.nextBatter,
        s: () => k.canSteal && k.command({ type: 'steal' }),
        b: () => k.canBunt && k.command({ type: 'bunt' }),
        w: () => !k.s.userBatting && k.command({ type: 'ibb' }),
        h: () => k.s.userBatting && k.s.bench.length && setSheet('pinch'),
        p: () => !k.s.userBatting && k.s.bullpen.length && setSheet('pitcher'),
        o: () => setSheet('orders'),
      };
      const fn = map[key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    // Narrow screens stack everything; with room for two columns the field sits on the left and the rest on the right.
    <div className="@container">
    <div className="mx-auto flex max-w-xl flex-col gap-3 @lg:grid @lg:max-w-6xl @lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] @4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] @lg:items-start">
      {/* Field */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface @lg:sticky @lg:top-[4.5rem]">
        <AnimatedField
          fieldingColor={fieldingTeam.primaryColor}
          battingColor={battingTeam.primaryColor}
          names={names}
          bases={s.bases}
          batterId={s.batterId}
          queue={queue}
          speed={speed}
          onDone={onPlayed}
          svgClassName="bg-[#0d1a14] @lg:max-h-[calc(100dvh-9.5rem)]"
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

      {/* Upright phones: the right column's cards join the stack, scoreboard first. */}
      <div className="contents @lg:flex @lg:min-w-0 @lg:flex-col @lg:gap-3">
        <section className="order-first rounded-2xl border border-line bg-surface p-3 @lg:order-none @lg:p-4">
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

        {/* Manager controls: pinned above the tab bar on upright phones, in the column otherwise. */}
        <section className="pb-safe @container sticky bottom-20 z-20 order-last rounded-2xl border border-line bg-surface p-3 shadow-lg @lg:static @lg:order-none @lg:shadow-none">
          {decision && (
            <DecisionCard decision={decision} skipped={skipped} busy={busy} onAccept={accept} onKeepGoing={advance} />
          )}
          <div className="grid grid-cols-3 gap-2 [&>button]:h-9 [&>button]:text-xs">
            {s.userBatting ? (
              <>
                <button className={btn} disabled={busy || !canSteal} onClick={() => command({ type: 'steal' })}>{stealLabel}<Kbd k="S" /></button>
                <button className={btn} disabled={busy || !canBunt} onClick={() => command({ type: 'bunt' })}>Bunt<Kbd k="B" /></button>
                <button className={btn} disabled={busy || s.bench.length === 0} onClick={() => setSheet('pinch')}>Pinch hit<Kbd k="H" /></button>
              </>
            ) : (
              <>
                <button className={btn} disabled={busy} onClick={() => command({ type: 'ibb' })}>Walk him<Kbd k="W" /></button>
                <button className={`${btn} col-span-2`} disabled={busy || s.bullpen.length === 0} onClick={() => setSheet('pitcher')}>Pitching change<Kbd k="P" /></button>
              </>
            )}
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
            <button
              onClick={advance}
              disabled={busy}
              className="flex h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-accent px-2 font-semibold text-accent-contrast disabled:opacity-60"
              title="Play until there's a decision to make (Space)"
            >
              <Icon name="forward" className="size-4 shrink-0" /> <span className="truncate">Next decision</span>
            </button>
            <button className={`${btn} text-xs`} disabled={busy} onClick={nextBatter} title="Play one batter (N)">
              Next batter
            </button>
            <button
              className={`${btn} flex items-center gap-1 text-xs ${auto ? 'border-accent text-accent' : ''}`}
              onClick={() => setAuto(!auto)}
              aria-pressed={auto}
              title="Play on by itself, pausing at decisions (A)"
            >
              <Icon name={auto ? 'pause' : 'play'} className="size-3.5" /> Auto
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <div className="flex gap-1">
              <button className="h-8 rounded-lg px-2 font-medium text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40" disabled={busy} onClick={simInning}>Sim ½ inning</button>
              <button className="h-8 rounded-lg px-2 font-medium text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40" disabled={busy} onClick={finish}>Sim game</button>
            </div>
            <button className="h-8 rounded-lg px-2 font-medium text-accent hover:bg-surface-2" onClick={() => setSheet('orders')}>Standing orders<Kbd k="O" /></button>
          </div>
          {auto && !decision && <p className="mt-1 text-center text-[11px] text-muted">Autoplay is on: it pauses when there's a decision.</p>}
          <p className="mt-1 hidden text-center text-[11px] text-muted md:block">
            Keys: Space next decision · Enter take the suggestion · N next batter · A autoplay
          </p>
        </section>

        <MatchupPanel
          s={s}
          batter={batter}
          pitcher={pitcher}
          onDeck={players.get(s.onDeckId)}
          battingTeam={battingTeam}
          fieldingTeam={fieldingTeam}
          userTeamId={team.id}
        />

        <section className="rounded-2xl border border-line bg-surface p-3 @lg:p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Last plays</h2>
          {plays.length === 0 ? <p className="text-sm text-muted">Play ball!</p> : (
            <ol className="space-y-1 text-sm">
              {plays.map((l, i) => <li key={i} className={i === 0 ? 'font-medium' : 'text-muted'}>{l.trim()}</li>)}
            </ol>
          )}
        </section>
      </div>


      <OrdersSheet open={sheet === 'orders'} onClose={() => setSheet(null)} />
      <PickSheet
        open={sheet === 'pinch' || sheet === 'pitcher'}
        title={sheet === 'pinch' ? `Pinch hit for ${shortName(batter)} (${s.batterPosition})` : `Replace ${shortName(pitcher)}`}
        position={sheet === 'pinch' ? s.batterPosition : undefined}
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
    </div>
  );
}

/** A keyboard shortcut hint, shown on desktop only. */
function Kbd({ k }: { k: string }) {
  return <kbd className="ml-1.5 hidden rounded bg-surface-2 px-1 text-[10px] font-medium text-muted md:inline">{k}</kbd>;
}

function ScoreSide({ team, runs, hits, batting, right }: { team: Team; runs: number; hits: number; batting: boolean; right?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <TeamBadge team={team} />
      <div>
        <p className="text-3xl font-bold tabular-nums leading-none">{runs}</p>
        <p className={`whitespace-nowrap text-[11px] ${batting ? 'font-semibold text-accent' : 'text-muted'}`}>{team.abbr} · {hits} H</p>
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

function PickSheet({
  open, title, ids, players, userTeamId, onPick, onClose, position,
}: {
  open: boolean; title: string; ids: number[]; players: Map<number, Player>; userTeamId: number; onPick: (id: number) => void; onClose: () => void;
  /** For a pinch hitter: the position he'd take over, so the bench shows who can play it. */
  position?: string;
}) {
  const stats = useStatsMap();
  const canPlay = (p: Player) => !!position && (position === 'DH' || position === 'P' || p.position === position || p.positionRatings[position as keyof Player['positionRatings']] !== undefined);
  // Players who can handle the spot first, then the best gloves there.
  const glove = (id: number) => (position && position !== 'DH' && position !== 'P' ? defenseAt(players.get(id)!, position as FieldPosition) : 0);
  ids = position ? [...ids].sort((a, b) => Number(canPlay(players.get(b)!)) - Number(canPlay(players.get(a)!)) || glove(b) - glove(a)) : ids;
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
                  {position && position !== 'DH' && position !== 'P' && (
                    <span className={`mt-0.5 block text-[11px] font-semibold ${canPlay(p) ? 'text-accent' : 'text-muted'}`}>
                      {canPlay(p) ? 'Plays' : 'Out of position at'} {position} · glove {scouted(p, `def-${position}`, defenseAt(p, position as FieldPosition), userTeamId).value}
                    </span>
                  )}
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
