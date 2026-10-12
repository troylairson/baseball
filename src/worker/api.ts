import {
  addDays, DEFAULT_SETTINGS, generateLeague, overall, seasonOver, simDay,
  type GeneratedLeague, type LeagueSettings, type PlayedGame, type ScheduledGame, type SeasonState,
} from '../engine';
import { GameDB, type BoxScore } from '../db/db';
import { createSave, deleteSave, listSaves, loadBoxScore, loadSave, persistProgress, type LoadedSave } from '../db/saves';

export interface TeamPreview {
  id: number;
  city: string;
  name: string;
  abbr: string;
  primaryColor: string;
  secondaryColor: string;
  divisionName: string;
  market: number;
  overall: number;
  payroll: number;
}

export type SimMode = 'next' | 'week' | 'month' | 'season';

export interface SimProgress {
  date: string;
  /** 0–1 share of the requested stretch completed. */
  fraction: number;
}

const yieldToEvents = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Engine API exposed to the UI. Runs inside a Web Worker so generation and
 * simulation never block rendering. The worker owns the loaded career; the
 * UI receives snapshots.
 */
export function createEngineApi(db = new GameDB()) {
  let pending: { seed: number; generated: GeneratedLeague } | null = null;
  let session: { save: LoadedSave; state: SeasonState } | null = null;
  let cancelRequested = false;

  const open = async (saveId: string): Promise<LoadedSave | null> => {
    const save = await loadSave(db, saveId);
    if (!save) {
      session = null;
      return null;
    }
    session = {
      save,
      state: {
        league: save.league,
        teams: save.teams,
        players: save.players,
        schedule: save.schedule,
        stats: new Map(save.stats.map((s) => [s.playerId, s])),
        userTeamId: save.meta.userTeamId,
        seed: save.meta.seed,
      },
    };
    return save;
  };

  return {
    /** Generate a fresh league and return team summaries for team selection. */
    async previewLeague(settings: LeagueSettings = DEFAULT_SETTINGS, seed?: number): Promise<TeamPreview[]> {
      const s = seed ?? Math.floor(Math.random() * 2 ** 32);
      const generated = generateLeague(s, settings);
      pending = { seed: s, generated };
      return generated.teams.map((team) => {
        const roster = generated.players.filter((p) => p.teamId === team.id && p.level === 'MLB');
        return {
          id: team.id,
          city: team.city,
          name: team.name,
          abbr: team.abbr,
          primaryColor: team.primaryColor,
          secondaryColor: team.secondaryColor,
          divisionName: generated.league.divisions.find((d) => d.id === team.divisionId)?.name ?? '',
          market: team.market,
          overall: Math.round(roster.reduce((sum, p) => sum + overall(p), 0) / roster.length),
          payroll: roster.reduce((sum, p) => sum + (p.contract?.salary ?? 0), 0),
        };
      });
    },

    /** Commit the previewed league as a new save, managed by the chosen team. */
    async startCareer(userTeamId: number): Promise<string> {
      if (!pending) throw new Error('No league previewed');
      const meta = await createSave(db, pending.generated, { userTeamId, seed: pending.seed });
      pending = null;
      return meta.id;
    },

    listSaves: () => listSaves(db),
    loadSave: open,
    async deleteSave(saveId: string) {
      if (session?.save.meta.id === saveId) session = null;
      await deleteSave(db, saveId);
    },

    async getBoxScore(gameId: number): Promise<BoxScore | null> {
      if (!session) return null;
      return loadBoxScore(db, session.save.meta.id, gameId);
    },

    cancelSim() {
      cancelRequested = true;
    },

    /**
     * Simulate forward. Persists once at the end (or when cancelled) and
     * returns the updated snapshot.
     */
    async sim(mode: SimMode, onProgress?: (p: SimProgress) => void): Promise<LoadedSave> {
      if (!session) throw new Error('No career loaded');
      const { save, state } = session;
      cancelRequested = false;
      const startDate = state.league.phase === 'preseason' ? (state.schedule.find((g) => !g.played)?.date ?? state.league.date) : state.league.date;
      const endDate = mode === 'week' ? addDays(startDate, 7) : mode === 'month' ? addDays(startDate, 30) : null;
      const totalGames = state.schedule.length;
      const playedBefore = state.schedule.filter((g) => g.played).length;
      const user = state.userTeamId;

      const played: PlayedGame[] = [];
      let days = 0;
      while (!seasonOver(state) && !cancelRequested) {
        const today = simDay(state);
        played.push(...today);
        days++;
        if (mode === 'next' && today.some(({ game }) => game.homeId === user || game.awayId === user)) break;
        if (endDate && state.league.date >= endDate) break;
        if (days % 3 === 0) {
          const fraction = endDate
            ? Math.min(1, days / (mode === 'week' ? 7 : 30))
            : mode === 'season'
              ? (state.schedule.filter((g) => g.played).length - playedBefore) / Math.max(1, totalGames - playedBefore)
              : 0;
          onProgress?.({ date: state.league.date, fraction });
          await yieldToEvents();
        }
      }

      save.stats = [...state.stats.values()];
      const changed: ScheduledGame[] = played.map((p) => p.game);
      const boxes: BoxScore[] = played.map(({ game, result }) => ({ gameId: game.id, season: state.league.season, date: game.date, result }));
      await persistProgress(db, save, changed, boxes);
      return save;
    },
  };
}

export type EngineApi = ReturnType<typeof createEngineApi>;
