import {
  avg, era, eraPlus, fip, ipString, isPitcher, obp, ops, opsPlus, per9, rate3, slg, whip, woba, type Player, type PlayerSeasonStats,
} from '../../engine';
import { useLeagueRates, warFor } from '../stats';
import { useEffect, useState } from 'react';
import { useGame } from '../../state/game';
import { engine } from '../../worker/client';
import { PlayerActions } from './PlayerActions';
import { MoraleSummary } from '../components/Morale';
import { RecentForm } from '../components/RecentForm';
import { PlatoonControl } from '../components/PlatoonControl';
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

      {player.injury && (
        <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          Injured: {player.injury.description}, out about {player.injury.days} more day{player.injury.days === 1 ? '' : 's'}.
        </p>
      )}
      <CareerSummary player={player} />
      <MoraleSummary player={player} />
      <PlatoonControl player={player} />
      <div className="mt-4">
        <PlayerActions player={player} />
      </div>

      <SeasonStats player={player} stats={save.stats.find((s) => s.playerId === player.id)} season={save.league.season} />
      {player.teamId === userTeamId && <RecentForm player={player} />}
      <CareerStats player={player} />

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

function SeasonStats({ player, stats, season }: { player: Player; stats: PlayerSeasonStats | undefined; season: number }) {
  const lg = useLeagueRates();
  if (!stats) return null;
  const war = warFor(player, stats, lg).toFixed(1);
  const cells: [string, string | number][] = isPitcher(player)
    ? stats.pit.g === 0
      ? []
      : [
          ['W-L', `${stats.pit.w}-${stats.pit.l}`], ['ERA', era(stats.pit).toFixed(2)], ['G', stats.pit.g], ['SV', stats.pit.sv],
          ['IP', ipString(stats.pit.outs)], ['SO', stats.pit.so], ['BB', stats.pit.bb], ['WHIP', whip(stats.pit).toFixed(2)],
          ['ERA+', eraPlus(stats.pit, lg)], ['FIP', fip(stats.pit, lg).toFixed(2)], ['K/9', per9(stats.pit.so, stats.pit).toFixed(1)], ['WAR', war],
        ]
    : stats.bat.pa === 0
      ? []
      : [
          ['AVG', rate3(avg(stats.bat))], ['OBP', rate3(obp(stats.bat))], ['SLG', rate3(slg(stats.bat))], ['OPS', rate3(ops(stats.bat))],
          ['HR', stats.bat.hr], ['RBI', stats.bat.rbi], ['R', stats.bat.r], ['SB', stats.bat.sb],
          ['OPS+', opsPlus(stats.bat, lg)], ['wOBA', rate3(woba(stats.bat))], ['BB%', `${((stats.bat.bb / stats.bat.pa) * 100).toFixed(1)}`], ['WAR', war],
        ];
  if (cells.length === 0) return null;
  return (
    <Section title={`${season} season`}>
      <dl className="grid grid-cols-4 gap-2">
        {cells.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface-2 py-2 text-center">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function CareerSummary({ player }: { player: Player }) {
  const save = useGame((s) => s.save)!;
  const c = player.career;
  const hof = save.league.hallOfFame?.find((h) => h.playerId === player.id);
  if (!c && !hof) return null;
  const line = c
    ? isPitcher(player)
      ? `${c.pit.w}-${c.pit.l}, ${era(c.pit).toFixed(2)} ERA, ${c.pit.so} K`
      : `${rate3(avg(c.bat))}, ${c.bat.hr} HR, ${c.bat.h} H`
    : '';
  return (
    <div className="mt-3 rounded-xl border border-line px-3 py-2 text-sm">
      {hof && <p className="mb-1 font-semibold text-accent">Hall of Fame · inducted {hof.season} ({hof.votePct}%)</p>}
      {c && (
        <p className="text-muted">
          <span className="font-medium text-ink">Career:</span> {c.seasons} season{c.seasons === 1 ? '' : 's'} · {line} · {c.war.toFixed(1)} WAR
          {c.awards.length > 0 && <> · {c.awards.length} award{c.awards.length > 1 ? 's' : ''}</>}
          {c.titles > 0 && <> · {c.titles} title{c.titles > 1 ? 's' : ''}</>}
        </p>
      )}
    </div>
  );
}

function CareerStats({ player }: { player: Player }) {
  const [rows, setRows] = useState<{ id: number; data: PlayerSeasonStats[] } | null>(null);
  const version = useGame((s) => s.save?.meta.updatedAt);
  useEffect(() => {
    let live = true;
    engine().getCareerStats(player.id).then((data) => live && setRows({ id: player.id, data }));
    return () => {
      live = false;
    };
  }, [player.id, version]);
  const data = rows?.id === player.id ? rows.data.filter((s) => (isPitcher(player) ? s.pit.g : s.bat.pa)) : [];
  if (data.length < 2) return null;
  const teams = useGame.getState().save!.teams;
  const abbr = (id: number) => teams.find((t) => t.id === id)?.abbr ?? '—';
  const th = 'pb-1.5 text-right font-medium';
  return (
    <Section title="Career">
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[20rem] text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-muted">
              <th className="pb-1.5 text-left font-medium">Year</th>
              {isPitcher(player) ? (
                <><th className={th}>W-L</th><th className={th}>ERA</th><th className={th}>IP</th><th className={th}>SO</th><th className={th}>SV</th></>
              ) : (
                <><th className={th}>AVG</th><th className={th}>OPS</th><th className={th}>HR</th><th className={th}>RBI</th><th className={th}>SB</th></>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.season} className="border-t border-line">
                <td className="py-1.5">{s.season} <span className="text-xs text-muted">{abbr(s.teamId)}</span></td>
                {isPitcher(player) ? (
                  <>
                    <td className="text-right">{s.pit.w}-{s.pit.l}</td><td className="text-right">{era(s.pit).toFixed(2)}</td>
                    <td className="text-right">{ipString(s.pit.outs)}</td><td className="text-right">{s.pit.so}</td><td className="text-right">{s.pit.sv}</td>
                  </>
                ) : (
                  <>
                    <td className="text-right">{rate3(avg(s.bat))}</td><td className="text-right">{rate3(ops(s.bat))}</td>
                    <td className="text-right">{s.bat.hr}</td><td className="text-right">{s.bat.rbi}</td><td className="text-right">{s.bat.sb}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
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
