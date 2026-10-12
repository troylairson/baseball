import Dexie, { type Table } from 'dexie';
import type { League, Player, Team } from '../engine';

export interface SaveMeta {
  id: string;
  name: string;
  userTeamId: number;
  season: number;
  seed: number;
  createdAt: number;
  updatedAt: number;
}

export type StoredLeague = League & { saveId: string };
export type StoredTeam = Team & { saveId: string };
export type StoredPlayer = Player & { saveId: string };

export class GameDB extends Dexie {
  saves!: Table<SaveMeta, string>;
  leagues!: Table<StoredLeague, string>;
  teams!: Table<StoredTeam, [string, number]>;
  players!: Table<StoredPlayer, [string, number]>;

  constructor(name = 'diamond-gm') {
    super(name);
    this.version(1).stores({
      saves: 'id, updatedAt',
      leagues: 'saveId',
      teams: '[saveId+id], saveId',
      players: '[saveId+id], saveId, [saveId+teamId]',
    });
  }
}
