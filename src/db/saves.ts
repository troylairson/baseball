import {
  generateSchedule, Rng, type GeneratedLeague, type League, type Player, type PlayerSeasonStats, type ScheduledGame, type Team,
} from '../engine';
import type { BoxScore, GameDB, SaveMeta } from './db';

export interface LoadedSave {
  meta: SaveMeta;
  league: League;
  teams: Team[];
  players: Player[];
  schedule: ScheduledGame[];
  /** Current-season stats. */
  stats: PlayerSeasonStats[];
}

function strip<T extends { saveId: string }>({ saveId: _saveId, ...rest }: T): Omit<T, 'saveId'> {
  return rest;
}

const tag = <T>(saveId: string) => (row: T) => ({ ...row, saveId });

export async function createSave(
  db: GameDB,
  generated: GeneratedLeague,
  opts: { userTeamId: number; seed: number; name?: string },
): Promise<SaveMeta> {
  const now = Date.now();
  const team = generated.teams.find((t) => t.id === opts.userTeamId);
  if (!team) throw new Error(`Unknown team ${opts.userTeamId}`);
  const meta: SaveMeta = {
    id: crypto.randomUUID(),
    name: opts.name ?? `${team.city} ${team.name}`,
    userTeamId: opts.userTeamId,
    season: generated.league.season,
    seed: opts.seed,
    createdAt: now,
    updatedAt: now,
  };
  const { league, teams, players } = generated;
  const schedule = generateSchedule(teams, league.settings.gamesPerSeason, league.season, new Rng(`${opts.seed}-schedule-${league.season}`));
  const saveId = meta.id;
  await db.transaction('rw', [db.saves, ...db.saveTables], async () => {
    await db.saves.add(meta);
    await db.leagues.add({ ...league, saveId });
    await db.teams.bulkAdd(teams.map(tag(saveId)));
    await db.players.bulkAdd(players.map(tag(saveId)));
    await db.games.bulkAdd(schedule.map(tag(saveId)));
  });
  return meta;
}

export function listSaves(db: GameDB): Promise<SaveMeta[]> {
  return db.saves.orderBy('updatedAt').reverse().toArray();
}

export async function loadSave(db: GameDB, saveId: string): Promise<LoadedSave | null> {
  const meta = await db.saves.get(saveId);
  if (!meta) return null;
  const [league, teams, players, games] = await Promise.all([
    db.leagues.get(saveId),
    db.teams.where('saveId').equals(saveId).toArray(),
    db.players.where('saveId').equals(saveId).toArray(),
    db.games.where('saveId').equals(saveId).toArray(),
  ]);
  if (!league) return null;
  const stats = await db.stats.where('[saveId+season]').equals([saveId, league.season]).toArray();

  // Saves from before the season engine existed: fill new fields and build a schedule.
  for (const t of teams) {
    t.runsScored ??= 0;
    t.runsAllowed ??= 0;
    t.rotationSlot ??= 0;
  }
  for (const p of players) p.fatigue ??= 0;
  let schedule = games.map(strip).sort((a, b) => a.id - b.id);
  if (schedule.length === 0) {
    schedule = generateSchedule(teams, league.settings.gamesPerSeason, league.season, new Rng(`${meta.seed}-schedule-${league.season}`));
    await db.games.bulkAdd(schedule.map(tag(saveId)));
  }

  return {
    meta,
    league: strip(league),
    teams: teams.map(strip).sort((a, b) => a.id - b.id),
    players: players.map(strip).sort((a, b) => a.id - b.id),
    schedule,
    stats: stats.map(strip),
  };
}

export interface ProgressChanges {
  changedGames?: ScheduledGame[];
  boxScores?: BoxScore[];
  /** Players deleted from the league (e.g. undrafted prospects). */
  removedPlayerIds?: number[];
  /** A new season started: replace the stored schedule. */
  newSchedule?: boolean;
}

/** Write back everything simulation or a front-office action can change. */
export async function persistProgress(db: GameDB, save: LoadedSave, changes: ProgressChanges = {}): Promise<void> {
  const saveId = save.meta.id;
  save.meta.updatedAt = Date.now();
  save.meta.season = save.league.season;
  await db.transaction('rw', [db.saves, ...db.saveTables], async () => {
    await db.saves.put(save.meta);
    await db.leagues.put({ ...save.league, saveId });
    await db.teams.bulkPut(save.teams.map(tag(saveId)));
    await db.players.bulkPut(save.players.map(tag(saveId)));
    if (changes.removedPlayerIds?.length) {
      await db.players.bulkDelete(changes.removedPlayerIds.map((id) => [saveId, id] as [string, number]));
    }
    await db.stats.bulkPut(save.stats.map(tag(saveId)));
    if (changes.newSchedule) {
      await db.games.where('saveId').equals(saveId).delete();
      await db.games.bulkAdd(save.schedule.map(tag(saveId)));
    } else if (changes.changedGames?.length) {
      await db.games.bulkPut(changes.changedGames.map(tag(saveId)));
    }
    if (changes.boxScores?.length) await db.boxScores.bulkPut(changes.boxScores.map(tag(saveId)));
  });
}

/** All stored stats for one player across seasons. */
export async function loadCareerStats(db: GameDB, saveId: string, playerId: number): Promise<PlayerSeasonStats[]> {
  const rows = await db.stats.where('saveId').equals(saveId).filter((s) => s.playerId === playerId).toArray();
  return rows.map(strip).sort((a, b) => a.season - b.season);
}

export async function loadBoxScore(db: GameDB, saveId: string, gameId: number): Promise<BoxScore | null> {
  const row = await db.boxScores.get([saveId, gameId]);
  return row ? strip(row) : null;
}

export async function deleteSave(db: GameDB, saveId: string): Promise<void> {
  await db.transaction('rw', [db.saves, ...db.saveTables], async () => {
    await db.saves.delete(saveId);
    for (const table of db.saveTables) await table.where('saveId').equals(saveId).delete();
  });
}
