import Dexie, { type Table } from 'dexie';
import type { GameResult, League, Player, PlayerSeasonStats, ScheduledGame, Team } from '../engine';

export interface SaveMeta {
  id: string;
  name: string;
  userTeamId: number;
  season: number;
  seed: number;
  createdAt: number;
  updatedAt: number;
}

export interface BoxScore {
  gameId: number;
  season: number;
  date: string;
  result: GameResult;
}

type InSave<T> = T & { saveId: string };
export type StoredLeague = InSave<League>;
export type StoredTeam = InSave<Team>;
export type StoredPlayer = InSave<Player>;
export type StoredGame = InSave<ScheduledGame>;
export type StoredStats = InSave<PlayerSeasonStats>;
export type StoredBoxScore = InSave<BoxScore>;

export class GameDB extends Dexie {
  saves!: Table<SaveMeta, string>;
  leagues!: Table<StoredLeague, string>;
  teams!: Table<StoredTeam, [string, number]>;
  players!: Table<StoredPlayer, [string, number]>;
  games!: Table<StoredGame, [string, number]>;
  stats!: Table<StoredStats, [string, number, number]>;
  boxScores!: Table<StoredBoxScore, [string, number]>;

  constructor(name = 'diamond-gm') {
    super(name);
    this.version(1).stores({
      saves: 'id, updatedAt',
      leagues: 'saveId',
      teams: '[saveId+id], saveId',
      players: '[saveId+id], saveId, [saveId+teamId]',
    });
    this.version(2).stores({
      games: '[saveId+id], saveId',
      stats: '[saveId+season+playerId], saveId, [saveId+season]',
      boxScores: '[saveId+gameId], saveId',
    });
  }

  /** Every table holding per-save data. */
  get saveTables() {
    return [this.leagues, this.teams, this.players, this.games, this.stats, this.boxScores];
  }
}
