import type { GeneratedLeague, League, Player, Team } from '../engine';
import type { GameDB, SaveMeta } from './db';

export interface LoadedSave {
  meta: SaveMeta;
  league: League;
  teams: Team[];
  players: Player[];
}

function strip<T extends { saveId: string }>({ saveId: _saveId, ...rest }: T): Omit<T, 'saveId'> {
  return rest;
}

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
  const saveId = meta.id;
  await db.transaction('rw', [db.saves, db.leagues, db.teams, db.players], async () => {
    await db.saves.add(meta);
    await db.leagues.add({ ...generated.league, saveId });
    await db.teams.bulkAdd(generated.teams.map((t) => ({ ...t, saveId })));
    await db.players.bulkAdd(generated.players.map((p) => ({ ...p, saveId })));
  });
  return meta;
}

export function listSaves(db: GameDB): Promise<SaveMeta[]> {
  return db.saves.orderBy('updatedAt').reverse().toArray();
}

export async function loadSave(db: GameDB, saveId: string): Promise<LoadedSave | null> {
  const meta = await db.saves.get(saveId);
  if (!meta) return null;
  const [league, teams, players] = await Promise.all([
    db.leagues.get(saveId),
    db.teams.where('saveId').equals(saveId).toArray(),
    db.players.where('saveId').equals(saveId).toArray(),
  ]);
  if (!league) return null;
  return {
    meta,
    league: strip(league),
    teams: teams.map(strip).sort((a, b) => a.id - b.id),
    players: players.map(strip).sort((a, b) => a.id - b.id),
  };
}

export async function deleteSave(db: GameDB, saveId: string): Promise<void> {
  await db.transaction('rw', [db.saves, db.leagues, db.teams, db.players], async () => {
    await db.saves.delete(saveId);
    await db.leagues.delete(saveId);
    await db.teams.where('saveId').equals(saveId).delete();
    await db.players.where('saveId').equals(saveId).delete();
  });
}
