import { DEFAULT_SETTINGS, generateLeague, overall, type GeneratedLeague, type LeagueSettings } from '../engine';
import { GameDB } from '../db/db';
import { createSave, deleteSave, listSaves, loadSave } from '../db/saves';

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

/**
 * Engine API exposed to the UI. Runs inside a Web Worker so generation and
 * (later) simulation never block rendering.
 */
export function createEngineApi(db = new GameDB()) {
  let pending: { seed: number; generated: GeneratedLeague } | null = null;

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
    loadSave: (saveId: string) => loadSave(db, saveId),
    deleteSave: (saveId: string) => deleteSave(db, saveId),
  };
}

export type EngineApi = ReturnType<typeof createEngineApi>;
