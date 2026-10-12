import {
  addNews, addDays, advanceOffseason, beginOffseason, DEFAULT_SETTINGS, draftPlayer, ensureCareerDefaults, generateLeague,
  autoDraftPick, executeTrade, fixRoster, letPlayerGo, rosterIssues, overall, playoffsOver, resignPlayer, runDraft, seasonOver, signFreeAgent, simDay, ACTIVE_ROSTER_SIZE,
  type GeneratedLeague, type LeagueSettings, type PlayedGame, type PlayerSeasonStats, type SavedPlan, type ScheduledGame,
  type SeasonState, type TradeProposal,
} from '../engine';
import { GameDB, type BoxScore } from '../db/db';
import {
  createSave, deleteSave, listSaves, loadBoxScore, loadCareerStats, loadSave, persistProgress, type LoadedSave,
} from '../db/saves';

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

export type SimMode = 'next' | 'week' | 'month' | 'season' | 'playoffs';

export interface SimProgress {
  date: string;
  /** 0–1 share of the requested stretch completed. */
  fraction: number;
}

/** Result of a front-office action: the new snapshot, or why it was refused. */
export type ActionResult = { ok: true; save: LoadedSave } | { ok: false; reason: string };

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
    const state: SeasonState = {
      league: save.league,
      teams: save.teams,
      players: save.players,
      schedule: save.schedule,
      stats: new Map(save.stats.map((s) => [s.playerId, s])),
      userTeamId: save.meta.userTeamId,
      seed: save.meta.seed,
    };
    const fresh = !save.league.owner;
    ensureCareerDefaults(state);
    session = { save, state };
    if (fresh) await persistProgress(db, save);
    return save;
  };

  const current = () => {
    if (!session) throw new Error('No career loaded');
    return session;
  };

  /** Copy engine state back onto the snapshot (arrays may have been replaced). */
  const sync = () => {
    const { save, state } = current();
    save.players = state.players;
    save.schedule = state.schedule;
    save.stats = [...state.stats.values()];
    return save;
  };

  const user = () => current().state.teams.find((t) => t.id === current().state.userTeamId)!;

  /** Persist after a front-office action and return the snapshot. */
  const commit = async (changes?: Parameters<typeof persistProgress>[2]): Promise<ActionResult> => {
    const save = sync();
    await persistProgress(db, save, changes);
    return { ok: true, save };
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

    async getCareerStats(playerId: number): Promise<PlayerSeasonStats[]> {
      if (!session) return [];
      const stored = await loadCareerStats(db, session.save.meta.id, playerId);
      // The current season lives in memory and may be ahead of storage.
      const live = session.state.stats.get(playerId);
      return [...stored.filter((s) => s.season !== session!.state.league.season), ...(live ? [live] : [])];
    },

    cancelSim() {
      cancelRequested = true;
    },

    /**
     * Simulate forward. Persists once at the end (or when cancelled) and
     * returns the updated snapshot.
     */
    async sim(mode: SimMode, onProgress?: (p: SimProgress) => void): Promise<LoadedSave> {
      const { state } = current();
      cancelRequested = false;
      const startPhase = state.league.phase === 'preseason' ? 'regular' : state.league.phase;
      const startDate = state.league.phase === 'preseason' ? (state.schedule.find((g) => !g.played)?.date ?? state.league.date) : state.league.date;
      const endDate = mode === 'week' ? addDays(startDate, 7) : mode === 'month' ? addDays(startDate, 30) : null;
      const remaining = (s: SeasonState) => s.schedule.filter((g) => g.seriesId === undefined && !g.played).length;
      const remainingBefore = remaining(state);
      const userId = state.userTeamId;

      const done = () => {
        if (state.league.phase === 'offseason') return true;
        if (mode === 'playoffs') return playoffsOver(state);
        if (state.league.phase === 'playoffs') return playoffsOver(state) || startPhase !== 'playoffs';
        // Regular season: stop at its end; the next sim starts the playoffs.
        return seasonOver(state) && startPhase === 'regular' && mode !== 'next';
      };

      // Rosters must be legal before games: fill holes left by moves or injuries.
      for (const team of state.teams) {
        const org = state.players.filter((p) => p.teamId === team.id && !p.retired);
        if (rosterIssues(org.filter((p) => p.level === 'MLB')).length === 0) continue;
        const moves = fixRoster(org);
        if (team.id === userId && moves.length) {
          addNews(state.league, {
            kind: 'team',
            title: 'Roster filled automatically',
            body: `${moves.length} move(s) were made so the active roster is legal.`,
            mine: true,
          });
        }
      }

      const played: PlayedGame[] = [];
      let days = 0;
      while (!done() && !cancelRequested) {
        const today = simDay(state);
        played.push(...today);
        days++;
        if (mode === 'next' && (today.some(({ game }) => game.homeId === userId || game.awayId === userId) || today.length === 0 && seasonOver(state))) break;
        if (mode === 'next' && state.league.phase === 'playoffs' && startPhase === 'regular') break;
        if (endDate && state.league.date >= endDate) break;
        if (days % 3 === 0) {
          const fraction = endDate
            ? Math.min(1, days / (mode === 'week' ? 7 : 30))
            : mode === 'season' ? 1 - remaining(state) / Math.max(1, remainingBefore) : 0;
          onProgress?.({ date: state.league.date, fraction });
          await yieldToEvents();
        }
      }

      const changedGames: ScheduledGame[] = played.map((p) => p.game);
      const boxScores: BoxScore[] = played.map(({ game, result }) => ({ gameId: game.id, season: state.league.season, date: game.date, result }));
      const save = sync();
      await persistProgress(db, save, { changedGames, boxScores });
      return save;
    },

    /** Move to the next phase / offseason stage. */
    async advance(): Promise<ActionResult> {
      const { state } = current();
      const { league } = state;
      if (league.phase === 'playoffs' && playoffsOver(state)) {
        beginOffseason(state);
        return commit();
      }
      if (league.phase === 'offseason') {
        const seasonBefore = league.season;
        const removed = advanceOffseason(state);
        const newSeason = league.season !== seasonBefore;
        return commit({ removedPlayerIds: removed, newSchedule: newSeason });
      }
      return { ok: false, reason: 'Nothing to advance right now.' };
    },

    // --- Roster management -------------------------------------------------

    async setPlan(plan: SavedPlan | null): Promise<ActionResult> {
      user().plan = plan;
      return commit();
    },

    async setLevel(playerId: number, level: 'MLB' | 'AAA'): Promise<ActionResult> {
      const { state } = current();
      const p = state.players.find((x) => x.id === playerId);
      if (!p || p.teamId !== state.userTeamId) return { ok: false, reason: 'That player is not in your organization.' };
      if (p.level === level) return { ok: false, reason: `Already in ${level}.` };
      const active = state.players.filter((x) => x.teamId === state.userTeamId && x.level === 'MLB' && !x.retired).length;
      if (level === 'MLB' && active >= ACTIVE_ROSTER_SIZE) {
        return { ok: false, reason: `The active roster is full (${ACTIVE_ROSTER_SIZE}). Send someone down first.` };
      }
      p.level = level;
      addNews(state.league, {
        kind: 'transaction',
        title: level === 'MLB' ? `Called up ${p.firstName} ${p.lastName}` : `Optioned ${p.firstName} ${p.lastName} to AAA`,
        playerId,
        mine: true,
      });
      return commit();
    },

    // --- Offseason actions ---------------------------------------------------

    async resign(playerId: number): Promise<ActionResult> {
      if (!resignPlayer(current().state, playerId)) return { ok: false, reason: 'That player cannot be re-signed now.' };
      return commit();
    },

    async letGo(playerId: number): Promise<ActionResult> {
      letPlayerGo(current().state, playerId);
      return commit();
    },

    async signFreeAgent(playerId: number): Promise<ActionResult> {
      const { state } = current();
      const res = signFreeAgent(state, state.userTeamId, playerId);
      if (!res.ok) return res;
      return commit();
    },

    async draft(playerId: number): Promise<ActionResult> {
      const { state } = current();
      const draft = state.league.draft;
      const pick = draft?.picks[draft.current];
      if (!pick || pick.teamId !== state.userTeamId) return { ok: false, reason: "You're not on the clock." };
      if (!draftPlayer(state, playerId)) return { ok: false, reason: 'That player is not available.' };
      runDraft(state, false);
      return commit();
    },

    async trade(proposal: TradeProposal): Promise<ActionResult> {
      const { state } = current();
      const res = executeTrade(state, proposal);
      if (!res.ok) return res;
      return commit();
    },

    /** Let the scouting department make the user's current pick. */
    async autoPick(): Promise<ActionResult> {
      const { state } = current();
      const draft = state.league.draft;
      const pick = draft?.picks[draft.current];
      if (!pick || pick.teamId !== state.userTeamId) return { ok: false, reason: "You're not on the clock." };
      autoDraftPick(state);
      runDraft(state, false);
      return commit();
    },
  };
}

export type EngineApi = ReturnType<typeof createEngineApi>;
