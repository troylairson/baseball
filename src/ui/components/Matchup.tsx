import {
  avg, era, ipString, isPitcher, ops, rate3, whip, type LiveSituation, type Player, type PlayerSeasonStats, type Team,
} from '../../engine';
import { fullName, shortName } from '../format';
import { scoutedOverall } from '../scouting';
import { useStatsMap } from '../stats';
import { arsenalSummary } from './Arsenal';
import { RatingBadge } from './Rating';
import { TeamBadge } from './TeamBadge';

export type MatchupVariant = 'a' | 'b' | 'c';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

function seasonLine(p: Player, s: PlayerSeasonStats | undefined): string {
  if (isPitcher(p)) {
    if (!s || !s.pit.outs) return 'No innings yet this season';
    return `${era(s.pit).toFixed(2)} ERA · ${whip(s.pit).toFixed(2)} WHIP · ${s.pit.w}-${s.pit.l}${s.pit.sv ? `, ${s.pit.sv} SV` : ''}`;
  }
  if (!s || !s.bat.pa) return 'No at-bats yet this season';
  return `${rate3(avg(s.bat))} AVG · ${rate3(ops(s.bat))} OPS · ${s.bat.hr} HR`;
}

interface Side {
  label: string;
  team: Team;
  player: Player;
  /** Position chip: "3B" for the batter, "SP"/"RP" for the pitcher. */
  pos: string;
  /** "Bats L · 4th" / "Throws R". */
  role: string;
  today: string;
  extra?: string | null;
}

export interface MatchupPanelProps {
  variant: MatchupVariant;
  s: LiveSituation;
  batter: Player;
  pitcher: Player;
  onDeck?: Player;
  battingTeam: Team;
  fieldingTeam: Team;
  userTeamId: number;
}

/** Batter vs pitcher: who they are, which club, where they play, how they're doing. */
export function MatchupPanel({ variant, s, batter, pitcher, onDeck, battingTeam, fieldingTeam, userTeamId }: MatchupPanelProps) {
  const sides: Side[] = [
    {
      label: 'At bat', team: battingTeam, player: batter, pos: s.batterPosition,
      role: `Bats ${batter.bats} · ${ordinal(s.batterSpot)} in order`,
      today: `${s.batterLine.h}-${s.batterLine.ab} today${s.batterLine.hr ? `, ${s.batterLine.hr} HR` : ''}${s.batterLine.bb ? `, ${s.batterLine.bb} BB` : ''}`,
    },
    {
      label: 'Pitching', team: fieldingTeam, player: pitcher, pos: pitcher.position,
      role: `Throws ${pitcher.throws}`,
      today: `${ipString(s.pitcherLine.outs)} IP, ${s.pitcherLine.so} K · ${s.pitcherPitches} pitches`,
      extra: arsenalSummary(pitcher),
    },
  ];
  const onDeckLine = onDeck && <p className="mt-2 truncate border-t border-line pt-2 text-xs text-muted">On deck: <span className="font-medium text-ink">{fullName(onDeck)}</span></p>;

  if (variant === 'b') {
    return (
      <section className="grid grid-cols-2 gap-2 @lg:grid-cols-1 @4xl:grid-cols-2">
        {sides.map((x) => <HeaderCard key={x.label} side={x} userTeamId={userTeamId} />)}
      </section>
    );
  }
  if (variant === 'c') {
    return (
      <section className="rounded-2xl border border-line bg-surface p-2">
        <div className="grid grid-cols-1 gap-2">
          {sides.map((x) => <TintRow key={x.label} side={x} userTeamId={userTeamId} />)}
        </div>
        {onDeck && <p className="mt-2 truncate px-1 text-xs text-muted">On deck: <span className="font-medium text-ink">{shortName(onDeck)}</span></p>}
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-line bg-surface p-3 @lg:p-4">
      <div className="grid min-w-0 grid-cols-2 gap-3 @lg:grid-cols-1 @4xl:grid-cols-2">
        {sides.map((x) => <StripeCard key={x.label} side={x} userTeamId={userTeamId} />)}
      </div>
      {onDeckLine}
    </section>
  );
}

function Stats({ side }: { side: Side }) {
  const stats = useStatsMap();
  return (
    <>
      <p className="truncate text-xs text-muted">{side.today}</p>
      {side.extra && <p className="truncate text-xs text-muted">{side.extra}</p>}
      <p className="truncate text-xs font-medium tabular-nums">{seasonLine(side.player, stats.get(side.player.id))}</p>
    </>
  );
}

function PosChip({ pos, color }: { pos: string; color?: string }) {
  return (
    <span
      className="inline-flex h-5 min-w-7 shrink-0 items-center justify-center rounded px-1 text-[11px] font-bold"
      style={color ? { background: color, color: '#fff' } : undefined}
    >
      {pos}
    </span>
  );
}

/** A: a stripe of team colour down the side, the club's badge, and a position chip. */
function StripeCard({ side, userTeamId }: { side: Side; userTeamId: number }) {
  const { ovr } = scoutedOverall(side.player, userTeamId);
  return (
    <div className="flex min-w-0 items-start gap-2 border-l-4 pl-2" style={{ borderColor: side.team.primaryColor }}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
          <TeamBadge team={side.team} size="sm" />
          <span className="truncate">{side.label}</span>
          <PosChip pos={side.pos} color={side.team.primaryColor} />
        </p>
        <p className="mt-1 truncate font-semibold">{fullName(side.player)}</p>
        <p className="truncate text-xs text-muted">{side.role}</p>
        <Stats side={side} />
      </div>
      <RatingBadge value={ovr} size="sm" />
    </div>
  );
}

/** B: each side gets a header in its team's colours, like a jersey. */
function HeaderCard({ side, userTeamId }: { side: Side; userTeamId: number }) {
  const { ovr } = scoutedOverall(side.player, userTeamId);
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2 px-3 py-1.5 text-white" style={{ background: side.team.primaryColor, boxShadow: `inset 0 -3px 0 ${side.team.secondaryColor}` }}>
        <span className="text-xs font-bold">{side.team.abbr}</span>
        <span className="flex-1 truncate text-[11px] uppercase tracking-wide opacity-90">{side.label}</span>
        <span className="rounded bg-white/20 px-1.5 text-[11px] font-bold">{side.pos}</span>
      </div>
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{fullName(side.player)}</p>
          <p className="truncate text-xs text-muted">{side.role}</p>
          <Stats side={side} />
        </div>
        <RatingBadge value={ovr} size="sm" />
      </div>
    </div>
  );
}

/** C: full-width rows tinted with each team's colour, a big position marker up front. */
function TintRow({ side, userTeamId }: { side: Side; userTeamId: number }) {
  const { ovr } = scoutedOverall(side.player, userTeamId);
  return (
    <div
      className="flex min-w-0 items-center gap-3 rounded-xl p-2.5"
      style={{ background: `color-mix(in srgb, ${side.team.primaryColor} 14%, var(--surface))` }}
    >
      <span
        className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl leading-none text-white"
        style={{ background: side.team.primaryColor, boxShadow: `inset 0 -3px 0 ${side.team.secondaryColor}` }}
      >
        <span className="text-base font-extrabold">{side.pos}</span>
        <span className="mt-0.5 text-[9px] font-bold opacity-85">{side.team.abbr}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted">{side.label} · {side.role}</p>
        <p className="truncate font-semibold">{fullName(side.player)}</p>
        <Stats side={side} />
      </div>
      <RatingBadge value={ovr} size="sm" />
    </div>
  );
}
