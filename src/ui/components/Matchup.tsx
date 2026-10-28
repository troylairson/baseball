import {
  avg, era, ipString, isPitcher, ops, rate3, whip, type LiveSituation, type Player, type PlayerSeasonStats, type Team,
} from '../../engine';
import { fullName } from '../format';
import { scoutedOverall } from '../scouting';
import { useStatsMap } from '../stats';
import { arsenalSummary } from './Arsenal';
import { RatingBadge } from './Rating';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

function seasonLine(p: Player, s: PlayerSeasonStats | undefined): string {
  if (isPitcher(p)) {
    if (!s || !s.pit.outs) return 'No stats yet this season';
    return `${era(s.pit).toFixed(2)} ERA · ${whip(s.pit).toFixed(2)} WHIP · ${s.pit.w}-${s.pit.l}${s.pit.sv ? `, ${s.pit.sv} SV` : ''}`;
  }
  if (!s || !s.bat.pa) return 'No stats yet this season';
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
  s: LiveSituation;
  batter: Player;
  pitcher: Player;
  onDeck?: Player;
  battingTeam: Team;
  fieldingTeam: Team;
  userTeamId: number;
}

/** Batter vs pitcher: who they are, which club, where they play, how they're doing. */
export function MatchupPanel({ s, batter, pitcher, onDeck, battingTeam, fieldingTeam, userTeamId }: MatchupPanelProps) {
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
  return (
    <section>
      <div className="grid grid-cols-2 gap-2 @lg:grid-cols-1 @4xl:grid-cols-2">
        {sides.map((x) => <HeaderCard key={x.label} side={x} userTeamId={userTeamId} />)}
      </div>
      {onDeck && (
        <p className="mt-1.5 truncate px-1 text-xs text-muted">
          On deck: <span className="font-medium text-ink">{fullName(onDeck)}</span>
        </p>
      )}
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

/** Each side gets a header in its team's colours, like a jersey, with the position on it. */
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
