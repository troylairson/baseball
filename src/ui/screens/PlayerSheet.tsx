import { isPitcher, type Player } from '../../engine';
import { useGame } from '../../state/game';
import { BottomSheet } from '../components/BottomSheet';
import { RatingBadge, RatingBar } from '../components/Rating';
import { TeamBadge } from '../components/TeamBadge';
import { fullName, gradeLabel, money } from '../format';
import { accuracyFor, scouted, scoutedOverall, scoutedPotential } from '../scouting';

export function PlayerSheet({ playerId, onClose }: { playerId: number | null; onClose: () => void }) {
  const save = useGame((s) => s.save);
  const player = playerId !== null ? save?.players.find((p) => p.id === playerId) : undefined;
  return (
    <BottomSheet open={!!player} onClose={onClose} title={player ? fullName(player) : 'Player'}>
      {player && save && <PlayerDetail player={player} userTeamId={save.meta.userTeamId} />}
    </BottomSheet>
  );
}

function PlayerDetail({ player, userTeamId }: { player: Player; userTeamId: number }) {
  const save = useGame((s) => s.save)!;
  const team = save.teams.find((t) => t.id === player.teamId);
  const { ovr, pot } = scoutedOverall(player, userTeamId);
  const accuracy = accuracyFor(player, userTeamId);

  const bar = (label: string, key: string, value: number, potential?: number) => {
    const s = scouted(player, key, value, userTeamId);
    const p = potential !== undefined ? scoutedPotential(player, key, value, s.value, potential, userTeamId) : undefined;
    return <RatingBar key={key} label={label} value={s.value} potential={p} margin={s.margin} />;
  };

  return (
    <div>
      <div className="flex items-center gap-3 pr-10">
        {team && <TeamBadge team={team} />}
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold">{fullName(player)}</h2>
          <p className="text-sm text-muted">
            {player.position} · Age {player.age} · B/T {player.bats}/{player.throws} · {player.level}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Summary label="Overall"><RatingBadge value={ovr} size="lg" /><span className="text-xs text-muted">{gradeLabel(ovr)}</span></Summary>
        <Summary label="Potential"><RatingBadge value={pot} size="lg" /><span className="text-xs text-muted">{gradeLabel(pot)}</span></Summary>
        <Summary label="Contract">
          <span className="text-lg font-bold tabular-nums">{money(player.contract?.salary ?? 0)}</span>
          <span className="text-xs text-muted">{player.contract?.years ?? 0} yr{player.contract?.years === 1 ? '' : 's'} left</span>
        </Summary>
      </div>

      <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
        Scouting confidence: <strong className="text-ink">{accuracy >= 0.8 ? 'High' : accuracy >= 0.5 ? 'Medium' : 'Low'}</strong>. Shaded bands
        show the range the true rating likely falls in; markers show projected potential.
      </p>

      {isPitcher(player) ? (
        <Section title="Pitching">
          {bar('Stuff', 'stuff', player.pitching!.stuff, player.pitchingPotential!.stuff)}
          {bar('Control', 'control', player.pitching!.control, player.pitchingPotential!.control)}
          {bar('Movement', 'movement', player.pitching!.movement, player.pitchingPotential!.movement)}
          {bar('Stamina', 'stamina', player.pitching!.stamina, player.pitchingPotential!.stamina)}
        </Section>
      ) : (
        <>
          <Section title="Batting">
            {bar('Contact', 'contact', player.batting.contact, player.battingPotential.contact)}
            {bar('Power', 'power', player.batting.power, player.battingPotential.power)}
            {bar('Eye', 'eye', player.batting.eye, player.battingPotential.eye)}
            {bar('Speed', 'speed', player.batting.speed)}
          </Section>
          <Section title="Defense">
            {Object.entries(player.positionRatings).map(([pos, v]) => bar(pos, `def-${pos}`, v))}
            {bar('Arm', 'arm', player.fielding.arm)}
          </Section>
        </>
      )}

      <Section title="Makeup">
        {bar('Work ethic', 'work', player.personality.workEthic)}
        {bar('Leadership', 'lead', player.personality.leadership)}
        {bar('Loyalty', 'loyal', player.personality.loyalty)}
        {bar('Greed', 'greed', player.personality.greed)}
      </Section>
    </div>
  );
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-line py-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}
