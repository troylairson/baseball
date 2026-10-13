import {
  addNews, addDays, advanceOffseason, beginOffseason, DEFAULT_SETTINGS, draftPlayer, ensureCareerDefaults, generateLeague,
  acceptOffer, assistantHandleStage, refusesToResign, autoDraftPick, liveGame, prepareLiveGame, declineOffer, executeTrade, extendPlayer, hireStaff, letPlayerGo, ROLE_LABEL, overall, playoffsOver, resignPlayer, runDraft, seasonOver, signFreeAgent, simDay, ACTIVE_ROSTER_SIZE,
  type GeneratedLeague, type LeagueSettings, type PlayedGame, type PlayerSeasonStats, type SavedPlan, type ScheduledGame,
  type SeasonState, type TeamStrategy, type TradeProposal, type AdviceAction, type GameResult, type LiveCommand, type LiveSituation,
} from '../engine';
import { GameDB, type BoxScore } from '../db/db';
import {
  createSave, deleteSave, exportCareer, importCareer, listSaves, loadBoxScore, loadCareerStats, loadSave, persistProgress, type LoadedSave,
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

export type LiveState =
  | { status: 'live'; gameId: number; awayId: number; homeId: number; situation: LiveSituation; save?: LoadedSave }
  | { status: 'final'; gameId: number; save: LoadedSave }
  | { status: 'none'; reason: string; save?: LoadedSave };

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
  let live: {
    gen: Generator<LiveSituation, GameResult, LiveCommand | undefined>;
    gameId: number;
    awayId: number;
    homeId: number;
    situation: LiveSituation;
  } | null = null;

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

  const persistPlayed = async (played: PlayedGame[]) => {
    const { state } = current();
    const save = sync();
    await persistProgress(db, save, {
      changedGames: played.map((p) => p.game),
      boxScores: played.map(({ game, result }) => ({ gameId: game.id, season: state.league.season, date: game.date, result })),
    });
    return save;
  };

  /** Finish the live game: record it, play the rest of the day, persist. */
  const finishLive = async (result: GameResult): Promise<LiveState> => {
    const { state } = current();
    const gameId = live!.gameId;
    live = null;
    const played = simDay(state, new Map([[gameId, result]]));
    return { status: 'final', gameId, save: await persistPlayed(played) };
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
    /** JSON text of a career, ready to download. */
    async exportCareer(saveId: string): Promise<string | null> {
      if (session?.save.meta.id === saveId) await persistProgress(db, sync());
      const data = await exportCareer(db, saveId);
      return data ? JSON.stringify(data) : null;
    },
    async importCareer(json: string): Promise<{ ok: true; saveId: string } | { ok: false; reason: string }> {
      try {
        const meta = await importCareer(db, JSON.parse(json));
        return { ok: true, saveId: meta.id };
      } catch (e) {
        return { ok: false, reason: e instanceof SyntaxError ? 'That file is not valid JSON.' : (e as Error).message };
      }
    },
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

    /**
     * Start (or resume) a live game: sims ahead to the user's next game day,
     * then pauses before each of their plate appearances.
     */
    async liveStart(): Promise<LiveState> {
      if (live) return { status: 'live', gameId: live.gameId, awayId: live.awayId, homeId: live.homeId, situation: live.situation };
      const { state } = current();
      const played: PlayedGame[] = [];
      let setup = prepareLiveGame(state);
      for (let guard = 0; !setup && guard < 60; guard++) {
        const before = state.league.date;
        played.push(...simDay(state));
        if (state.league.date === before || state.league.phase === 'offseason' || playoffsOver(state)) break;
        if (state.league.phase === 'playoffs' && !state.league.playoffs?.series.some((s) => s.winnerId === null && (s.highId === state.userTeamId || s.lowId === state.userTeamId))) break;
        setup = prepareLiveGame(state);
      }
      // Always send a fresh snapshot: the season may have just started (phase/date changed).
      const save = played.length ? await persistPlayed(played) : sync();
      if (!setup) return { status: 'none', reason: 'Your team has no game to play right now.', save };
      const gen = liveGame(setup.away, setup.home, setup.useDH, setup.rng, true, setup.norms, { teamId: state.userTeamId });
      const step = gen.next();
      if (step.done) {
        const day = simDay(state, new Map([[setup.game.id, step.value]]));
        return { status: 'final', gameId: setup.game.id, save: await persistPlayed([...played, ...day]) };
      }
      live = { gen, gameId: setup.game.id, awayId: setup.game.awayId, homeId: setup.game.homeId, situation: step.value };
      return { status: 'live', gameId: live.gameId, awayId: live.awayId, homeId: live.homeId, situation: step.value, save };
    },

    async liveCommand(cmd: LiveCommand): Promise<LiveState> {
      if (!live) return { status: 'none', reason: 'No live game in progress.' };
      const step = live.gen.next(cmd);
      if (step.done) return finishLive(step.value);
      live.situation = step.value;
      return { status: 'live', gameId: live.gameId, awayId: live.awayId, homeId: live.homeId, situation: step.value };
    },

    /** Let the AI manage the rest of the live game. */
    async liveFinish(): Promise<LiveState> {
      if (!live) return { status: 'none', reason: 'No live game in progress.' };
      let step = live.gen.next({ type: 'auto' });
      while (!step.done) step = live.gen.next({ type: 'auto' });
      return finishLive(step.value);
    },

    /** Advance until the half-inning changes (or the game ends). */
    async liveSimInning(): Promise<LiveState> {
      if (!live) return { status: 'none', reason: 'No live game in progress.' };
      const { inning, half } = live.situation;
      let step = live.gen.next({ type: 'auto' });
      while (!step.done && step.value.inning === inning && step.value.half === half) step = live.gen.next({ type: 'auto' });
      if (step.done) return finishLive(step.value);
      live.situation = step.value;
      return { status: 'live', gameId: live.gameId, awayId: live.awayId, homeId: live.homeId, situation: step.value };
    },

    hasLiveGame: () => live !== null,

    cancelSim() {
      cancelRequested = true;
    },

    /**
     * Simulate forward. Persists once at the end (or when cancelled) and
     * returns the updated snapshot.
     */
    async sim(mode: SimMode, onProgress?: (p: SimProgress) => void): Promise<LoadedSave> {
      if (live) {
        let step = live.gen.next({ type: 'auto' });
        while (!step.done) step = live.gen.next({ type: 'auto' });
        await finishLive(step.value);
      }
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

    /** Carry out one of the assistant's suggestions. */
    async applyAdvice(action: AdviceAction): Promise<ActionResult> {
      const { state } = current();
      const byId = (id: number) => state.players.find((p) => p.id === id);
      if (action.kind === 'swap') {
        const up = byId(action.upId);
        const down = byId(action.downId);
        if (!up || !down || up.teamId !== state.userTeamId || down.teamId !== state.userTeamId) return { ok: false, reason: 'That move is no longer possible.' };
        down.level = 'AAA';
        up.level = 'MLB';
        addNews(state.league, { kind: 'transaction', title: `Called up ${up.firstName} ${up.lastName}`, body: `${down.firstName} ${down.lastName} optioned to AAA.`, playerId: up.id, mine: true });
        return commit();
      }
      if (action.kind === 'sign') {
        const res = signFreeAgent(state, state.userTeamId, action.playerId);
        return res.ok ? commit() : res;
      }
      const res = extendPlayer(state, action.playerId);
      return res.ok ? commit() : res;
    },

    /** Let the assistant make this offseason stage's decisions. */
    async assistantStage(): Promise<ActionResult> {
      const done = assistantHandleStage(current().state);
      if (done.length === 0) return { ok: false, reason: 'Nothing for your assistant to do here.' };
      return commit();
    },

    async setTicketPrice(level: number): Promise<ActionResult> {
      user().ticketPrice = Math.max(0, Math.min(4, Math.round(level)));
      return commit();
    },

    async setAutoRoster(on: boolean): Promise<ActionResult> {
      user().autoRoster = on;
      return commit();
    },

    async setStrategy(strategy: TeamStrategy): Promise<ActionResult> {
      user().strategy = strategy;
      return commit();
    },

    async setPlan(plan: SavedPlan | null): Promise<ActionResult> {
      user().plan = plan;
      return commit();
    },

    async setLevel(playerId: number, level: 'MLB' | 'AAA'): Promise<ActionResult> {
      const { state } = current();
      const p = state.players.find((x) => x.id === playerId);
      if (!p || p.teamId !== state.userTeamId) return { ok: false, reason: 'That player is not in your organization.' };
      if (p.level === level) return { ok: false, reason: `Already in ${level}.` };
      const active = state.players.filter((x) => x.teamId === state.userTeamId && x.level === 'MLB' && !x.retired && !x.injury).length;
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
      const p = current().state.players.find((x) => x.id === playerId);
      if (p && refusesToResign(p)) return { ok: false, reason: `${p.firstName} ${p.lastName} won't re-sign — he's unhappy here.` };
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

    async extend(playerId: number): Promise<ActionResult> {
      const res = extendPlayer(current().state, playerId);
      if (!res.ok) return res;
      return commit();
    },

    async acceptOffer(offerId: number): Promise<ActionResult> {
      const res = acceptOffer(current().state, offerId);
      if (!res.ok) {
        await commit();
        return res;
      }
      return commit();
    },

    async declineOffer(offerId: number): Promise<ActionResult> {
      declineOffer(current().state.league, offerId);
      return commit();
    },

    async hireStaff(staffId: number): Promise<ActionResult> {
      const { state } = current();
      const res = hireStaff(state.league, state.userTeamId, staffId);
      if (!res.ok) return res;
      const hire = state.league.staff!.find((s) => s.id === staffId)!;
      addNews(state.league, { kind: 'transaction', title: `Hired ${hire.name}`, body: `New ${ROLE_LABEL[hire.role].toLowerCase()} (rated ${hire.rating}).`, mine: true });
      return commit();
    },

    async setScoutingLevel(level: number): Promise<ActionResult> {
      user().scoutingLevel = Math.max(0, Math.min(2, Math.round(level)));
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
