import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PlayEvent } from '../../engine';
import { buildTimeline, restingFrames, sample, type Mark, type Speed, type Timeline } from './director';
import { basePoint, fencePath, FIELD_H, FIELD_W, HOME, MOUND, polar } from './geometry';

/** The canvas above the wall is empty sky; crop most of it. */
const VIEW_TOP = 30;
const POSITION_LABEL = ['', 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
/** How far a ball at height z (feet) is drawn above its shadow. */
const LIFT = 0.42;

export interface AnimatedFieldProps {
  fieldingColor: string;
  battingColor: string;
  names: Map<number, string>;
  /** Settled state shown when nothing is animating. */
  bases: (number | null)[];
  batterId: number | null;
  /** Plays to animate, in order. */
  queue: PlayEvent[];
  speed: Speed;
  onDone: () => void;
  /** Rendered beside the caption (e.g. a speed picker). */
  aside?: ReactNode;
}

/** Top-down ballpark that plays back structured play events. */
export function AnimatedField({ fieldingColor, battingColor, names, bases, batterId, queue, speed, onDone, aside }: AnimatedFieldProps) {
  const [index, setIndex] = useState(0);
  const playing = speed !== 'instant' && index < queue.length;
  const event = playing ? queue[index]! : null;
  const timeline = useMemo<Timeline | null>(() => (event ? buildTimeline({ event, speed }) : null), [event, speed]);

  // A new batch starts from the first play.
  const [batch, setBatch] = useState(queue);
  if (batch !== queue) {
    setBatch(queue);
    setIndex(0);
  }
  useEffect(() => {
    if (queue.length && !playing) onDone();
  }, [queue, playing, onDone]);

  // Elements the timeline drives, keyed like its tracks.
  const nodes = useRef(new Map<string, SVGGElement>());
  const shadow = useRef<SVGEllipseElement>(null);
  // How many of the current timeline's marks have fired.
  const [fired, setFired] = useState<{ tl: Timeline | null; n: number }>({ tl: null, n: 0 });
  const marks: Mark[] = timeline && fired.tl === timeline ? timeline.marks.slice(0, fired.n) : [];
  const skipTo = useRef<number | null>(null);

  const resting = useMemo(() => restingFrames(bases, batterId), [bases, batterId]);
  const runnerIds = useMemo(() => {
    const ids = new Set<number>();
    for (const id of bases) if (id !== null) ids.add(id);
    if (batterId !== null) ids.add(batterId);
    for (const r of event?.runners ?? []) ids.add(r.id);
    return [...ids];
  }, [bases, batterId, event]);

  const paint = useCallback((tl: Timeline | null, t: number) => {
    const tracks = tl ? tl.tracks : [...resting.tracks.entries()].map(([key, frames]) => ({ key, frames }));
    const seen = new Set<string>();
    for (const tr of tracks) {
      const el = nodes.current.get(tr.key);
      if (!el) continue;
      seen.add(tr.key);
      const f = sample(tr.frames, t);
      if (tr.key === 'ball') {
        const lift = (f.z ?? 0) * LIFT;
        el.setAttribute('transform', `translate(${f.x.toFixed(1)} ${(f.y - lift).toFixed(1)})`);
        el.style.opacity = String(f.o ?? 1);
        if (shadow.current) {
          shadow.current.setAttribute('cx', f.x.toFixed(1));
          shadow.current.setAttribute('cy', f.y.toFixed(1));
          shadow.current.style.opacity = String((f.o ?? 1) * Math.max(0.15, 0.5 - (f.z ?? 0) / 300));
        }
      } else {
        el.setAttribute('transform', `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)})`);
        el.style.opacity = String(f.o ?? 1);
      }
    }
    // Anyone not on a track this play (a runner who isn't involved) is hidden.
    for (const [key, el] of nodes.current) if (!seen.has(key) && key.startsWith('r')) el.style.opacity = '0';
  }, [resting]);

  // Resting layout whenever nothing is playing.
  useLayoutEffect(() => {
    if (!timeline) paint(null, 0);
  }, [timeline, paint, runnerIds]);

  // Play the current timeline.
  useEffect(() => {
    if (!timeline) return;
    let frame = 0;
    let start: number | null = null;
    let shown = 0;
    const tick = (now: number) => {
      start ??= now;
      let t = now - start;
      if (skipTo.current !== null) {
        t = timeline.duration;
        skipTo.current = null;
      }
      paint(timeline, t);
      const due = timeline.marks.filter((m) => m.t <= t).length;
      if (due !== shown) {
        shown = due;
        setFired({ tl: timeline, n: due });
      }
      if (t >= timeline.duration) {
        setIndex((i) => i + 1);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [timeline, paint]);

  const skip = () => {
    if (!playing) return;
    // Finish this play and everything queued behind it.
    skipTo.current = 0;
    setIndex(queue.length);
  };

  const count = [...marks].reverse().find((m) => m.kind === 'count');
  const badges = marks.filter((m) => m.kind === 'badge');
  const land = [...marks].reverse().find((m) => m.kind === 'land');
  const flash = marks.some((m) => m.kind === 'flash');
  const caption = event && marks.some((m) => m.kind === 'reveal') ? event.text : null;
  // Between plays, keep the last play on screen.
  const [lastText, setLastText] = useState<string | null>(null);
  const finished = queue.length && !playing ? queue[queue.length - 1]!.text : null;
  if (finished && finished !== lastText) setLastText(finished);
  const label = event?.text ?? describeBases(bases, names);

  return (
    <figure className="relative">
      <svg
        viewBox={`0 ${VIEW_TOP} ${FIELD_W} ${FIELD_H - VIEW_TOP}`}
        className="block w-full select-none"
        role="img"
        aria-label={label}
        onClick={skip}
      >
        <StaticPark />
        {flash && <rect width={FIELD_W} height={FIELD_H} fill={battingColor} className="animate-[fade_900ms_ease-out_forwards]" opacity={0.25} />}
        {land && <circle cx={land.at.x} cy={land.at.y} r={7} fill="none" stroke="#fbbf24" strokeWidth={1.4} strokeDasharray="2 2" />}

        {/* Fielders */}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((f) => (
          <g key={f} ref={(el) => { if (el) nodes.current.set(`f${f}`, el); else nodes.current.delete(`f${f}`); }}>
            <circle r={7.5} fill={fieldingColor} stroke="#f8fafc" strokeWidth={1.5} />
            <text y={2.6} textAnchor="middle" fontSize={7} fontWeight={700} fill="#fff">{POSITION_LABEL[f]}</text>
          </g>
        ))}

        {/* Runners and batter */}
        {runnerIds.map((id) => (
          <g key={id} ref={(el) => { if (el) nodes.current.set(`r${id}`, el); else nodes.current.delete(`r${id}`); }}>
            <circle r={6} fill="#f8fafc" stroke={battingColor} strokeWidth={3} />
            <circle r={7.6} fill="none" stroke="#0b1120" strokeWidth={0.8} />
            <text x={9} y={-7} fontSize={8} fill="#e2e8f0" stroke="#0b1120" strokeWidth={2.5} paintOrder="stroke">{names.get(id) ?? ''}</text>
          </g>
        ))}

        {/* Ball and shadow */}
        <ellipse ref={shadow} rx={3.6} ry={1.8} fill="#000" opacity={0} />
        <g ref={(el) => { if (el) nodes.current.set('ball', el); else nodes.current.delete('ball'); }} style={{ opacity: 0 }}>
          <circle r={3.4} fill="#fff" stroke="#0b1120" strokeWidth={0.6} />
        </g>

        {/* Badges */}
        {badges.map((m, i) => m.kind === 'badge' && (
          <g key={i} transform={`translate(${m.at.x} ${m.at.y - 14})`} className="animate-[pop_250ms_ease-out]">
            <rect x={-(m.text.length * 3.3 + 7)} y={-9} width={m.text.length * 6.6 + 14} height={16} rx={8}
              fill={m.tone === 'out' || m.tone === 'k' || m.tone === 'error' ? '#dc2626' : m.tone === 'hr' ? battingColor : '#16a34a'} />
            <text y={3} textAnchor="middle" fontSize={10} fontWeight={800} fill="#fff">{m.text}</text>
          </g>
        ))}

        {count && count.kind === 'count' && (
          <g transform={`translate(10 ${VIEW_TOP + 8})`}>
            <rect width={62} height={22} rx={6} fill="#0b1120" opacity={0.75} />
            <text x={31} y={15} textAnchor="middle" fontSize={11} fontWeight={700} fill="#f8fafc">{count.balls}–{count.strikes}</text>
          </g>
        )}
      </svg>

      {playing && (
        <button onClick={skip} className="absolute right-2 top-2 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white">
          Skip ›
        </button>
      )}
      <div className="flex items-start gap-2 px-3 py-2">
        <figcaption className="min-h-10 min-w-0 flex-1 text-sm" aria-live="polite">
          {caption ?? (event
            ? <span className="text-muted">{event.kind === 'pa' && event.batterId !== undefined ? `${names.get(event.batterId) ?? ''} at bat…` : ''}</span>
            : <span className="text-muted">{lastText}</span>)}
        </figcaption>
        {aside}
      </div>
    </figure>
  );
}

function describeBases(bases: (number | null)[], names: Map<number, string>): string {
  const on = bases.map((id, i) => (id !== null ? `${names.get(id) ?? 'Runner'} on ${['first', 'second', 'third'][i]}` : null)).filter(Boolean);
  return on.length ? `Field: ${on.join(', ')}.` : 'Field: bases empty.';
}

/** The ballpark itself; drawn once. */
function StaticPark() {
  const corner = (a: number) => polar(a, 330);
  const lf = corner(-45);
  const rf = corner(45);
  const dirt = [polar(-45, 150), polar(-20, 158), polar(0, 160), polar(20, 158), polar(45, 150)];
  const infieldGrass = [basePoint(0), basePoint(1), basePoint(2), basePoint(3)].map((p) => ({ x: p.x, y: p.y + 3 }));
  return (
    <g>
      <rect width={FIELD_W} height={FIELD_H} fill="#0b1a12" />
      <defs>
        <pattern id="mow" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="11" height="22" fill="#1b6b39" />
          <rect x="11" width="11" height="22" fill="#18603a" />
        </pattern>
      </defs>
      <path d={`M${HOME.x} ${HOME.y} L${lf.x} ${lf.y} ${fencePath().replace(/^M/, 'L')} L${HOME.x} ${HOME.y} Z`} fill="url(#mow)" />
      <path d={fencePath(-10)} fill="none" stroke="#8a5a1c" strokeWidth={9} strokeOpacity={0.7} />
      <path d={fencePath()} fill="none" stroke="#e2e8f0" strokeWidth={2} />
      <path d={`M${HOME.x} ${HOME.y} L${dirt[0]!.x} ${dirt[0]!.y} Q${dirt[1]!.x} ${dirt[1]!.y - 30} ${dirt[2]!.x} ${dirt[2]!.y} Q${dirt[3]!.x} ${dirt[3]!.y - 30} ${dirt[4]!.x} ${dirt[4]!.y} Z`} fill="#9a6a2c" />
      <path d={`M${infieldGrass.map((p) => `${p.x} ${p.y}`).join(' L')} Z`} fill="#1d7340" transform={`translate(0 -3)`} />
      <circle cx={MOUND.x} cy={MOUND.y} r={7} fill="#9a6a2c" />
      <rect x={MOUND.x - 3} y={MOUND.y - 1} width={6} height={2} fill="#f8fafc" />
      <path d={`M${HOME.x} ${HOME.y} L${lf.x} ${lf.y} M${HOME.x} ${HOME.y} L${rf.x} ${rf.y}`} stroke="#f8fafc" strokeWidth={1.2} opacity={0.9} />
      {[1, 2, 3].map((b) => {
        const p = basePoint(b);
        return <rect key={b} x={p.x - 4} y={p.y - 4} width={8} height={8} fill="#f8fafc" transform={`rotate(45 ${p.x} ${p.y})`} />;
      })}
      <path d={`M${HOME.x - 5} ${HOME.y - 2} h10 v4 l-5 4 l-5 -4 z`} fill="#f8fafc" />
    </g>
  );
}
