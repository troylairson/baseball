import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { avg, era, ipString, isPitcher, rate3, userLog, type BatLog, type PitLog, type Player } from '../../engine';
import { useSave } from '../../state/game';

const H = 110;
const PAD = { top: 10, right: 8, bottom: 6, left: 34 };
const plotH = H - PAD.top - PAD.bottom;

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Game-by-game form for a player on the user's team this season. */
export function RecentForm({ player }: { player: Player }) {
  const save = useSave();
  const log = userLog(save.league);
  const season = save.stats.find((s) => s.playerId === player.id);
  const abbr = new Map(save.teams.map((t) => [t.id, t.abbr]));
  if (save.league.phase !== 'regular' || !season) return null;
  if (isPitcher(player)) {
    const games = log.pit[player.id] ?? [];
    return games.length >= 2 ? <PitcherForm games={games} seasonEra={era(season.pit)} abbr={abbr} /> : null;
  }
  const games = (log.bat[player.id] ?? []).filter((g) => g.pa > 0);
  return games.length >= 5 ? <HitterForm games={games} seasonAvg={avg(season.bat)} abbr={abbr} /> : null;
}

// ---------------------------------------------------------------------------

function windowAvg(games: BatLog[]) {
  const ab = games.reduce((s, g) => s + g.ab, 0);
  return ab ? games.reduce((s, g) => s + g.h, 0) / ab : 0;
}

const count = (n: number, label: string) => (n ? [`${n > 1 ? `${n} ` : ''}${label}`] : []);
const batLine = (g: BatLog) => [`${g.h}-for-${g.ab}`, ...count(g.hr, 'HR'), ...count(g.bb, 'BB'), ...count(g.so, 'K')].join(', ');
const pitLine = (g: PitLog) => `${ipString(g.outs)} IP, ${g.h} H, ${g.er} ER, ${g.bb} BB, ${g.so} K${g.sv ? ', SV' : ''}`;

function HitterForm({ games, seasonAvg, abbr }: { games: BatLog[]; seasonAvg: number; abbr: Map<number, string> }) {
  // Rolling 10-game average over the last 30 games.
  const start = Math.max(0, games.length - 30);
  const points = games.slice(start).map((g, i) => {
    const end = start + i + 1;
    return { game: g, value: windowAvg(games.slice(Math.max(0, end - 10), end)) };
  });
  const max = Math.max(0.4, ...points.map((p) => p.value));
  return (
    <FormSection
      tiles={[
        ['Last 7', rate3(windowAvg(games.slice(-7)))],
        ['Last 15', rate3(windowAvg(games.slice(-15)))],
        ['Season', rate3(seasonAvg)],
      ]}
      caption={`10-game batting average over his last ${points.length} games. Gray line: season average.`}
      count={points.length}
      rows={games.slice(-5).reverse().map((g) => [shortDate(g.d), abbr.get(g.vs) ?? '', batLine(g)])}
      tooltip={(i) => (
        <>
          <span className="text-muted">{shortDate(points[i]!.game.d)} vs {abbr.get(points[i]!.game.vs)}</span>
          <span className="font-medium">{batLine(points[i]!.game)}</span>
          <span className="tabular-nums">10-game AVG {rate3(points[i]!.value)}</span>
        </>
      )}
      plot={({ W, hover }) => {
        const plotW = W - PAD.left - PAD.right;
        const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
        const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
        const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
        const dot = hover ?? points.length - 1;
        return {
          x,
          svg: (
            <>
              <YAxis W={W} ticks={[0, max, seasonAvg]} format={rate3} y={y} />
              <line x1={PAD.left} x2={W - PAD.right} y1={y(seasonAvg)} y2={y(seasonAvg)} className="stroke-muted" strokeWidth={1} opacity={0.7} />
              <path d={path} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-muted" strokeWidth={1} />}
              <circle cx={x(dot)} cy={y(points[dot]!.value)} r={4} className="fill-accent stroke-surface" strokeWidth={2} />
            </>
          ),
        };
      }}
    />
  );
}

function PitcherForm({ games, seasonEra, abbr }: { games: PitLog[]; seasonEra: number; abbr: Map<number, string> }) {
  const starter = games.filter((g) => g.gs).length * 2 >= games.length;
  const recent = games.slice(-15);
  const max = Math.max(4, ...recent.map((g) => g.er));
  const windowEra = (n: number) => {
    const g = (starter ? games.filter((x) => x.gs) : games).slice(-n);
    const outs = g.reduce((s, x) => s + x.outs, 0);
    return outs ? ((g.reduce((s, x) => s + x.er, 0) * 27) / outs).toFixed(2) : '–';
  };
  const unit = starter ? 'starts' : 'outings';
  return (
    <FormSection
      tiles={[
        [`Last 3 ${unit}`, windowEra(3)],
        [`Last 7 ${unit}`, windowEra(7)],
        ['Season ERA', seasonEra.toFixed(2)],
      ]}
      caption={`Earned runs in each of his last ${recent.length} appearances.`}
      count={recent.length}
      rows={games.slice(-5).reverse().map((g) => [shortDate(g.d), abbr.get(g.vs) ?? '', pitLine(g)])}
      tooltip={(i) => (
        <>
          <span className="text-muted">{shortDate(recent[i]!.d)} vs {abbr.get(recent[i]!.vs)}{recent[i]!.gs ? ' (start)' : ''}</span>
          <span className="font-medium">{pitLine(recent[i]!)}</span>
        </>
      )}
      plot={({ W, hover }) => {
        const band = (W - PAD.left - PAD.right) / recent.length;
        const barW = Math.min(24, band - 2);
        const x = (i: number) => PAD.left + band * i + band / 2;
        const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
        return {
          x,
          svg: (
            <>
              <YAxis W={W} ticks={[0, max]} format={(v) => `${v} ER`} y={y} />
              {recent.map((g, i) => {
                const h = y(0) - y(g.er);
                const r = Math.min(4, h, barW / 2);
                const bx = x(i) - barW / 2;
                const top = y(0) - h;
                const opacity = hover === null || hover === i ? 1 : 0.45;
                return h > 0 ? (
                  <path
                    key={i}
                    d={`M${bx},${y(0)}V${top + r}Q${bx},${top} ${bx + r},${top}H${bx + barW - r}Q${bx + barW},${top} ${bx + barW},${top + r}V${y(0)}Z`}
                    className="fill-accent"
                    opacity={opacity}
                  />
                ) : (
                  <circle key={i} cx={x(i)} cy={y(0) - 4} r={2.5} className="fill-accent" opacity={opacity} />
                );
              })}
            </>
          ),
        };
      }}
    />
  );
}

// ---------------------------------------------------------------------------

function YAxis({ W, ticks, format, y }: { W: number; ticks: number[]; format: (v: number) => string; y: (v: number) => number }) {
  // Drop gridline labels that would collide with the reference value.
  const shown = ticks.filter((v, i) => i >= 2 || ticks.slice(2).every((r) => Math.abs(y(r) - y(v)) > 12));
  return (
    <>
      {ticks.slice(0, 2).map((v) => (
        <line key={`g${v}`} x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} />
      ))}
      {shown.map((v, i) => (
        <text key={`t${i}`} x={PAD.left - 5} y={y(v) + 3.5} textAnchor="end" className="fill-muted text-[10px] tabular-nums">{format(v)}</text>
      ))}
    </>
  );
}

function FormSection({ tiles, caption, count, rows, tooltip, plot }: {
  tiles: [string, string][];
  caption: string;
  count: number;
  rows: [string, string, string][];
  tooltip: (i: number) => ReactNode;
  plot: (args: { W: number; hover: number | null }) => { x: (i: number) => number; svg: ReactNode };
}) {
  const ref = useRef<HTMLElement>(null);
  const [W, setW] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { x, svg } = plot({ W, hover });
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < count; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Recent form</h3>
      <dl className="grid grid-cols-3 gap-2">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface-2 py-2 text-center">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <figure ref={ref} className="relative mt-3">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block touch-pan-y select-none"
          role="img"
          aria-label={caption}
          onPointerMove={move}
          onPointerDown={move}
          onPointerLeave={() => setHover(null)}
        >
          {svg}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 flex -translate-x-1/2 -translate-y-full flex-col rounded-lg border border-line bg-surface px-2 py-1 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(x(hover), 90), W - 90) }}
          >
            {tooltip(hover)}
          </div>
        )}
        <figcaption className="mt-1 text-xs text-muted">{caption}</figcaption>
      </figure>
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">Last 5 games</caption>
        <tbody>
          {rows.map(([d, vs, line], i) => (
            <tr key={i} className="border-t border-line">
              <td className="w-16 py-1.5 pr-2 whitespace-nowrap text-muted">{d}</td>
              <td className="w-12 py-1.5 pr-2 text-muted">{vs}</td>
              <td className="py-1.5 tabular-nums">{line}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
