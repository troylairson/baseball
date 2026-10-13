import { softenDemands, topUpFreeAgents } from '../generate/freeAgents';
import { generatePlayer } from '../generate/players';
import { isPitcher, overall } from '../model/ratings';
import { avg, era, ipString, ops, rate3 } from '../model/stats';
import type { Award, DraftPick, Player, Position, SeasonRecord, Team } from '../model/types';
import { battingWar, leagueContext, pitchingWar } from '../model/war';
import { developPlayer, retirementChance } from '../progression';
import { hashString, Rng } from '../rng';
import {
  arbitrationAward, contractDemand, contractStatus, EXTENSION_THRESHOLD, extensionTerms, extensionWillingness, MIN_SALARY, preArbRenewal,
} from './contracts';
import { addNews } from './news';
import { finalSeries } from './playoffs';
import { fixRoster } from './roster';
import { generateSchedule } from './schedule';
import { staffCost, staffOffseason, staffRating } from './staff';
import { refusesToResign } from './morale';
import { closeSeasonBooks, emptyFinances, nextBudget } from './finance';
import { addSeasonToCareers, emptyCareer, hallOfFameVote, updateSeasonRecords } from './legacy';
import { DRAFT_ROUNDS, pickId, pickOwner } from './picks';
import type { SeasonState } from './season';

export { DRAFT_ROUNDS } from './picks';
const MAX_AAA = 22;

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;

export function payroll(players: Player[], teamId: number): number {
  return players.filter((p) => p.teamId === teamId && !p.retired).reduce((s, p) => s + (p.contract?.salary ?? 0), 0);
}

/** Market-driven baseline budget in $K. */
export function marketBudget(market: number): number {
  return 70000 + market * 22000;
}

/** Owner's payroll budget in $K. */
export function payrollBudget(team: Team): number {
  return team.budget ?? marketBudget(team.market);
}

export function teamStrength(players: Player[], teamId: number): number {
  const roster = players.filter((p) => p.teamId === teamId && p.level === 'MLB' && !p.retired);
  return roster.reduce((s, p) => s + overall(p), 0) / Math.max(1, roster.length);
}

const org = (state: SeasonState, teamId: number) => state.players.filter((p) => p.teamId === teamId && !p.retired);
export const freeAgents = (players: Player[]) => players.filter((p) => p.teamId === null && !p.retired && !p.draftProspect);
export const draftPool = (players: Player[]) => players.filter((p) => p.draftProspect && p.teamId === null);

// ---------------------------------------------------------------------------
// Owner

/** Set the owner's expectations from the user team's preseason ranking. */
export function setOwnerTargets(state: SeasonState): void {
  const { league, teams, players } = state;
  const ranked = [...teams].sort((a, b) => teamStrength(players, b.id) - teamStrength(players, a.id));
  const rank = ranked.findIndex((t) => t.id === state.userTeamId) + 1;
  const frac = rank / teams.length;
  const games = league.settings.gamesPerSeason;
  const [winPct, expectation] =
    frac <= 0.25 ? [0.57, 'Win the division'] :
    frac <= 0.5 ? [0.53, 'Contend for a playoff spot'] :
    frac <= 0.75 ? [0.49, 'Finish around .500'] :
    [0.44, 'Rebuild and develop youth'];
  league.owner = {
    jobSecurity: league.owner?.jobSecurity ?? [75, 60, 45][league.settings.difficulty ?? 1]!,
    targetWins: Math.round(games * winPct),
    expectation,
    fired: league.owner?.fired ?? false,
    lastReview: league.owner?.lastReview ?? null,
  };
}

function ownerReview(state: SeasonState): void {
  const { league, teams, players } = state;
  const owner = league.owner!;
  const team = teams.find((t) => t.id === state.userTeamId)!;
  const playoffs = league.playoffs;
  let delta = (team.wins - owner.targetWins) * 1.5;
  const notes: string[] = [`${team.wins} wins against a target of ${owner.targetWins}`];
  if (playoffs) {
    const mine = playoffs.series.filter((s) => s.highId === team.id || s.lowId === team.id);
    if (mine.length) {
      delta += 6;
      const won = mine.filter((s) => s.winnerId === team.id).length;
      delta += won * 5;
      notes.push(won ? `won ${won} playoff series` : 'made the playoffs');
    }
    if (playoffs.championId === team.id) {
      delta += 10;
      notes.push('won the title');
    }
  }
  const over = payroll(players, team.id) + staffCost(league, team) - payrollBudget(team);
  if (over > 0) {
    const penalty = Math.min(15, (over / payrollBudget(team)) * 50);
    delta -= penalty;
    notes.push('went over budget');
  }
  // Owners are more forgiving on easy, quicker to anger on hard.
  if (delta < 0) delta *= [0.6, 1, 1.4][league.settings.difficulty ?? 1]!;
  owner.jobSecurity = Math.round(Math.max(0, Math.min(100, owner.jobSecurity + delta)));
  owner.fired = owner.jobSecurity <= 0;
  owner.lastReview = `${delta >= 0 ? 'Pleased' : 'Disappointed'}: ${notes.join(', ')}.`;
  addNews(league, {
    kind: 'owner',
    title: owner.fired ? 'You have been fired' : delta >= 0 ? 'The owner is pleased' : 'The owner is unhappy',
    body: `${owner.lastReview} Job security is now ${owner.jobSecurity}%.`,
    mine: true,
  });
}

// ---------------------------------------------------------------------------
// Awards & history

function computeAwards(state: SeasonState): Award[] {
  const { players, stats } = state;
  const lines = [...stats.values()];
  const lg = leagueContext(lines);
  const byId = new Map(players.map((p) => [p.id, p]));
  const teamGames = state.league.settings.gamesPerSeason;
  const rows = lines.map((s) => {
    const p = byId.get(s.playerId)!;
    const war = p && isPitcher(p) ? pitchingWar(s.pit, lg) : p ? battingWar(s.bat, p.position, lg) : 0;
    return { s, p, war };
  }).filter((r) => r.p);

  const awards: Award[] = [];
  const hitters = rows.filter((r) => !isPitcher(r.p) && r.s.bat.pa >= teamGames * 3.1);
  const pitchers = rows.filter((r) => isPitcher(r.p) && r.s.pit.outs >= teamGames * 3 * 0.6);
  const rookies = rows.filter((r) => (r.p.experience ?? 0) === 0 && (r.s.bat.pa >= 200 || r.s.pit.outs >= 150));
  const best = (list: typeof rows) => [...list].sort((a, b) => b.war - a.war)[0];
  const summary = (r: (typeof rows)[number]) =>
    isPitcher(r.p)
      ? `${r.s.pit.w}-${r.s.pit.l}, ${era(r.s.pit).toFixed(2)} ERA, ${r.s.pit.so} K, ${ipString(r.s.pit.outs)} IP · ${r.war.toFixed(1)} WAR`
      : `${rate3(avg(r.s.bat))}, ${r.s.bat.hr} HR, ${r.s.bat.rbi} RBI, ${rate3(ops(r.s.bat))} OPS · ${r.war.toFixed(1)} WAR`;
  const push = (name: string, r: (typeof rows)[number] | undefined) => {
    if (r) awards.push({ name, playerId: r.p.id, teamId: r.p.teamId, summary: summary(r) });
  };
  push('Most Valuable Player', best(hitters));
  push('Cy Young Award', best(pitchers));
  push('Rookie of the Year', best(rookies));
  return awards;
}

/** Called once the playoffs end: awards, history, owner review. */
export function beginOffseason(state: SeasonState): void {
  const { league, teams, players } = state;
  if (league.phase !== 'playoffs' || !league.playoffs || league.playoffs.championId === null) return;

  const awards = computeAwards(state);
  const final = finalSeries(league.playoffs);
  const record: SeasonRecord = {
    season: league.season,
    championId: league.playoffs.championId,
    runnerUpId: final.winnerId === final.highId ? final.lowId : final.highId,
    standings: teams.map((t) => ({ teamId: t.id, wins: t.wins, losses: t.losses })),
    awards,
    userTeamId: state.userTeamId,
  };
  league.history = [...(league.history ?? []), record];
  const byId = new Map(players.map((p) => [p.id, p]));
  addSeasonToCareers(state);
  for (const a of awards) {
    const p = byId.get(a.playerId)!;
    (p.career ??= emptyCareer()).awards.push(`${league.season} ${a.name}`);
    addNews(league, { kind: 'award', title: `${fullName(p)} wins the ${a.name}`, body: a.summary, playerId: p.id, teamId: a.teamId ?? undefined, mine: a.teamId === state.userTeamId });
  }
  updateSeasonRecords(state);
  hallOfFameVote(state);
  closeSeasonBooks(state);
  ownerReview(state);

  // Experience counts for players who saw real playing time.
  for (const s of state.stats.values()) {
    const p = byId.get(s.playerId);
    if (p && (s.bat.pa >= 130 || s.pit.outs >= 150)) p.experience = (p.experience ?? 0) + 1;
  }
  league.phase = 'offseason';
  league.offseason = 'review';
  league.date = `${league.season}-11-01`;
}

// ---------------------------------------------------------------------------
// Development, retirements and contracts

function developAndRetire(state: SeasonState, rng: Rng): void {
  const { league, players } = state;
  for (const p of players) {
    if (p.retired || p.draftProspect) continue;
    const coaching = p.teamId === null
      ? { hitting: 45, pitching: 45 }
      : { hitting: staffRating(league, p.teamId, 'hitting'), pitching: staffRating(league, p.teamId, 'pitching') };
    developPlayer(p, rng.fork(p.id), coaching);
  }
  for (const p of players) {
    if (p.retired || p.draftProspect) continue;
    const ovr = overall(p);
    if (rng.chance(retirementChance(p, ovr, p.teamId === null))) {
      const wasMine = p.teamId === state.userTeamId;
      p.retired = true;
      p.retiredSeason = league.season;
      p.teamId = null;
      p.contract = null;
      p.demand = null;
      if (ovr >= 58 || (p.experience ?? 0) >= 10 || wasMine) {
        addNews(league, {
          kind: 'transaction',
          title: `${fullName(p)} retires`,
          body: `Retires at ${p.age} after ${p.experience ?? 0} seasons.`,
          playerId: p.id,
          mine: wasMine,
        });
      }
    }
  }
}

/** Tick contracts; expiring deals get a demand. AI teams decide on their own players. */
function tickContracts(state: SeasonState, rng: Rng): void {
  for (const p of state.players) {
    if (p.retired || p.teamId === null || !p.contract) continue;
    p.contract.years--;
    if (p.contract.years > 0) continue;
    const status = contractStatus(p);
    const mine = p.teamId === state.userTeamId;
    // Minor leaguers: prospects are kept on cheap deals, others released.
    if (p.level === 'AAA' && status !== 'free-agent') {
      if (p.age <= 26 || overall(p, true) >= 50 || mine) p.contract = preArbRenewal(p);
      else releaseToFreeAgency(p);
      continue;
    }
    if (status === 'pre-arb') {
      // Team control: renewed automatically.
      p.contract = preArbRenewal(p);
      continue;
    }
    p.expiring = status;
    p.demand = status === 'arbitration' ? arbitrationAward(p) : contractDemand(p);
    if (mine) continue;
    const ovr = overall(p);
    const keep = status === 'arbitration'
      ? ovr >= 46 || overall(p, true) >= 55
      : ovr >= 48 && p.age <= 33 && rng.chance(0.6);
    if (keep) {
      p.contract = p.demand;
      p.demand = null;
      p.expiring = null;
    } else {
      releaseToFreeAgency(p);
    }
  }
}

function releaseToFreeAgency(p: Player): void {
  p.teamId = null;
  p.level = 'MLB';
  p.contract = null;
  p.expiring = null;
  p.demand = contractDemand(p);
}

/** The user's players whose contracts have run out and need a decision. */
export function expiringFor(state: SeasonState, teamId: number): Player[] {
  return state.players.filter((p) => p.teamId === teamId && !p.retired && p.contract?.years === 0);
}

export function resignPlayer(state: SeasonState, playerId: number): boolean {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.contract?.years !== 0 || !p.demand) return false;
  if (p.teamId === state.userTeamId && refusesToResign(p)) return false;
  const tender = p.expiring === 'arbitration';
  p.contract = { ...p.demand };
  p.demand = null;
  p.expiring = null;
  addNews(state.league, {
    kind: 'transaction',
    title: tender ? `Tendered ${fullName(p)} a contract` : `Re-signed ${fullName(p)}`,
    body: `${p.contract.years} year${p.contract.years > 1 ? 's' : ''} at $${(p.contract.salary / 1000).toFixed(1)}M per season.`,
    playerId,
    mine: true,
  });
  return true;
}

export function letPlayerGo(state: SeasonState, playerId: number): void {
  const p = state.players.find((x) => x.id === playerId);
  if (p && p.contract?.years === 0) releaseToFreeAgency(p);
}

// ---------------------------------------------------------------------------
// Free agency

export type SignResult = { ok: true } | { ok: false; reason: string };

export function signFreeAgent(state: SeasonState, teamId: number, playerId: number): SignResult {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.teamId !== null || p.retired || p.draftProspect) return { ok: false, reason: 'That player is not a free agent.' };
  const demand = p.demand ?? contractDemand(p);
  p.teamId = teamId;
  p.contract = { ...demand };
  p.demand = null;
  p.level = 'MLB';
  const moves = fixRoster(org(state, teamId));
  const mine = teamId === state.userTeamId;
  const team = state.teams.find((t) => t.id === teamId)!;
  if (mine || overall(p) >= 56) {
    addNews(state.league, {
      kind: 'transaction',
      title: `${team.city} sign ${fullName(p)}`,
      body: `${p.contract.years} year${p.contract.years > 1 ? 's' : ''}, $${(p.contract.salary / 1000).toFixed(1)}M per season.${
        mine && moves.length ? ` ${moves.filter((m) => m.to === 'AAA').length} player(s) optioned to AAA to make room.` : ''
      }`,
      playerId,
      teamId,
      mine,
    });
  }
  return { ok: true };
}

/** One pass of AI signings; each AI team signs at most one player per pass. */
/** The best affordable free agent who clearly upgrades a team's active roster. */
export function bestSigningFor(state: SeasonState, team: Team, exclude: Set<number> = new Set()): Player | undefined {
  const pool = freeAgents(state.players).sort((a, b) => overall(b) - overall(a));
  const room = payrollBudget(team) - payroll(state.players, team.id) - staffCost(state.league, team);
  const active = state.players.filter((p) => p.teamId === team.id && p.level === 'MLB' && !p.retired && !p.injury);
  for (const fa of pool) {
    if (exclude.has(fa.id)) continue;
    const demand = fa.demand ?? contractDemand(fa);
    if (demand.salary > room) continue;
    const peers = active.filter((p) => (isPitcher(fa) ? p.position === fa.position : !isPitcher(p) && p.position === fa.position));
    const comparable = peers.length ? peers : active.filter((p) => isPitcher(p) === isPitcher(fa));
    const worst = Math.min(...comparable.map((p) => overall(p)));
    if (overall(fa) >= worst + 2) return fa;
  }
  return undefined;
}

function aiFreeAgencyRound(state: SeasonState, rng: Rng): number {
  const taken = new Set<number>();
  let signed = 0;
  for (const team of rng.shuffle(state.teams.filter((t) => t.id !== state.userTeamId))) {
    const fa = bestSigningFor(state, team, taken);
    if (!fa) continue;
    taken.add(fa.id);
    signFreeAgent(state, team.id, fa.id);
    signed++;
  }
  return signed;
}

/** AI teams top up thin farm systems with cheap depth. */
function aiDepthSignings(state: SeasonState): void {
  const pool = freeAgents(state.players)
    .filter((p) => p.age <= 30)
    .sort((a, b) => overall(b, true) - overall(a, true));
  for (const team of state.teams) {
    if (team.id === state.userTeamId) continue;
    while (state.players.filter((p) => p.teamId === team.id && p.level === 'AAA' && !p.retired).length < 14 && pool.length) {
      const p = pool.shift()!;
      p.teamId = team.id;
      p.level = 'AAA';
      p.contract = { salary: MIN_SALARY, years: 1 };
      p.demand = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Draft

function generateDraftClass(state: SeasonState, rng: Rng): void {
  const usedNames = new Set(state.players.filter((p) => !p.retired).map((p) => `${p.firstName[0]}. ${p.lastName}`));
  let nextId = Math.max(...state.players.map((p) => p.id)) + 1;
  const count = state.teams.length * DRAFT_ROUNDS + Math.round(state.teams.length * 1.5);
  const positions = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'SP', 'SP', 'SP', 'RP'] as const;
  for (let i = 0; i < count; i++) {
    const college = rng.chance(0.55);
    const age = college ? rng.int(21, 22) : rng.int(18, 19);
    const talent = rng.normal(college ? 37 : 32, 4.5);
    const p = generatePlayer({ id: nextId++, position: rng.pick(positions), talent, age, teamId: null, level: 'AAA' }, rng, usedNames);
    p.draftProspect = true;
    p.experience = 0;
    state.players.push(p);
  }
}

function createDraftOrder(state: SeasonState): DraftPick[] {
  const order = [...state.teams].sort((a, b) => a.wins - b.wins || (a.runsScored - a.runsAllowed) - (b.runsScored - b.runsAllowed));
  const picks: DraftPick[] = [];
  for (let round = 1; round <= DRAFT_ROUNDS; round++) {
    for (const team of order) {
      const owner = pickOwner(state.league, pickId({ season: state.league.season, round, originalTeamId: team.id }));
      picks.push({ overall: picks.length + 1, round, teamId: owner, originalTeamId: team.id, playerId: null });
    }
  }
  return picks;
}

/** AI draft preference: mostly ceiling, some present ability, with per-team scouting noise. */
function aiDraftValue(p: Player, teamId: number): number {
  const noise = new Rng(hashString(`${teamId}-${p.id}`)).normal(0, 3);
  return overall(p, true) * 0.75 + overall(p) * 0.25 + noise;
}

export function draftPlayer(state: SeasonState, playerId: number): boolean {
  const draft = state.league.draft;
  if (!draft || draft.current >= draft.picks.length) return false;
  const p = state.players.find((x) => x.id === playerId);
  if (!p || !p.draftProspect || p.teamId !== null) return false;
  const pick = draft.picks[draft.current]!;
  pick.playerId = p.id;
  p.teamId = pick.teamId;
  p.draftProspect = false;
  p.level = 'AAA';
  p.contract = { salary: MIN_SALARY, years: 4 };
  draft.current++;
  if (pick.teamId === state.userTeamId || pick.round === 1 && pick.overall <= 3) {
    const team = state.teams.find((t) => t.id === pick.teamId)!;
    addNews(state.league, {
      kind: 'draft',
      title: `${team.city} draft ${fullName(p)} (#${pick.overall})`,
      body: `${p.position}, age ${p.age}.`,
      playerId: p.id,
      teamId: team.id,
      mine: team.id === state.userTeamId,
    });
  }
  return true;
}

/** Best available player for whichever team is on the clock (used for the user's auto-pick). */
export function autoDraftPick(state: SeasonState): boolean {
  const draft = state.league.draft;
  const pick = draft?.picks[draft.current];
  if (!pick) return false;
  const best = draftPool(state.players).sort((a, b) => aiDraftValue(b, pick.teamId) - aiDraftValue(a, pick.teamId))[0];
  return best ? draftPlayer(state, best.id) : false;
}

/** Make AI picks until the user is on the clock (or the draft ends). With `includeUser`, auto-pick for the user too. */
export function runDraft(state: SeasonState, includeUser: boolean): void {
  const draft = state.league.draft;
  if (!draft) return;
  while (draft.current < draft.picks.length) {
    const pick = draft.picks[draft.current]!;
    if (pick.teamId === state.userTeamId && !includeUser) return;
    const best = draftPool(state.players).sort((a, b) => aiDraftValue(b, pick.teamId) - aiDraftValue(a, pick.teamId))[0];
    if (!best) {
      draft.current = draft.picks.length;
      return;
    }
    draftPlayer(state, best.id);
  }
}

// ---------------------------------------------------------------------------
// Stage machine

/**
 * Advance the offseason one stage. Returns ids of players removed from the
 * league (undrafted prospects) so storage can delete them.
 */
export function advanceOffseason(state: SeasonState): number[] {
  const { league } = state;
  const rng = new Rng(`${state.seed}-offseason-${league.season}-${league.offseason}`);
  switch (league.offseason) {
    case 'review':
      developAndRetire(state, rng);
      staffOffseason(league, state.teams, state.userTeamId, rng.fork('staff'));
      tickContracts(state, rng);
      league.offseason = 'resign';
      league.date = `${league.season}-11-10`;
      return [];
    case 'resign':
      for (const p of expiringFor(state, state.userTeamId)) releaseToFreeAgency(p);
      aiFreeAgencyRound(state, rng);
      league.offseason = 'freeAgency';
      league.date = `${league.season}-12-01`;
      return [];
    case 'freeAgency':
      for (let i = 0; i < 6 && aiFreeAgencyRound(state, rng) > 0; i++);
      aiDepthSignings(state);
      generateDraftClass(state, rng);
      league.draft = { picks: createDraftOrder(state), current: 0 };
      league.offseason = 'draft';
      league.date = `${league.season + 1}-01-15`;
      runDraft(state, false);
      return [];
    case 'draft':
      runDraft(state, true);
      return startNewSeason(state, rng);
    default:
      return [];
  }
}

/** Organization-wide depth every team needs (MLB + AAA). */
const ORG_NEEDS: [Position, (p: Player) => boolean, number][] = [
  ['SP', (p) => p.position === 'SP', 7],
  ['C', (p) => p.position === 'C', 3],
  ['RP', (p) => isPitcher(p), 18],
  ['SS', (p) => !isPitcher(p), 17],
];

/** Sign the best available free agents to plug structural holes in an organization. */
function fillOrgNeeds(state: SeasonState, teamId: number): number {
  let signed = 0;
  for (const [position, match, min] of ORG_NEEDS) {
    while (org(state, teamId).filter(match).length < min) {
      // Nobody left on the market: a career minor leaguer is always available.
      const fa = freeAgents(state.players).filter(match).sort((a, b) => overall(b) - overall(a))[0] ?? replacementPlayer(state, position);
      fa.teamId = teamId;
      fa.level = 'AAA';
      fa.contract = { salary: Math.min(fa.demand?.salary ?? MIN_SALARY, MIN_SALARY * 2), years: 1 };
      fa.demand = null;
      signed++;
    }
  }
  return signed;
}

function replacementPlayer(state: SeasonState, position: Position): Player {
  const rng = new Rng(`${state.seed}-replacement-${state.players.length}`);
  const usedNames = new Set(state.players.map((p) => `${p.firstName[0]}. ${p.lastName}`));
  const id = Math.max(...state.players.map((p) => p.id)) + 1;
  const p = generatePlayer({ id, position, talent: rng.normal(41, 3), age: rng.int(26, 31), teamId: null, level: 'AAA' }, rng, usedNames);
  p.experience = 0;
  state.players.push(p);
  return p;
}

function trimMinors(state: SeasonState, teamId: number): void {
  const minors = state.players
    .filter((p) => p.teamId === teamId && p.level === 'AAA' && !p.retired)
    .sort((a, b) => overall(b, true) + overall(b) - (overall(a, true) + overall(a)));
  for (const p of minors.slice(MAX_AAA)) {
    if (p.age >= 27 || overall(p, true) < 40) {
      p.retired = true;
      p.teamId = null;
      p.contract = null;
    } else {
      releaseToFreeAgency(p);
    }
  }
}

/** Reset for a new season. Returns removed (undrafted) player ids. */
export function startNewSeason(state: SeasonState, rng: Rng): number[] {
  const { league } = state;
  const removed = draftPool(state.players).map((p) => p.id);
  const removedSet = new Set(removed);
  state.players = state.players.filter((p) => !removedSet.has(p.id));

  league.pickOwners = Object.fromEntries(
    Object.entries(league.pickOwners ?? {}).filter(([id]) => Number(id.split('-')[0]) > league.season),
  );
  league.season++;
  league.phase = 'preseason';
  league.offseason = null;
  league.playoffs = null;
  league.draft = null;
  league.date = `${league.season}-03-01`;

  for (const p of freeAgents(state.players)) {
    if (overall(p) < 40) {
      p.retired = true;
      p.demand = null;
    }
  }
  topUpFreeAgents(state.players, state.teams.length, rng.fork('free-agents'));
  softenDemands(state.players);
  for (const p of state.players) {
    p.fatigue = 0;
    // The offseason heals most injuries; only the longest carry over.
    if (p.injury) {
      p.injury.days -= 150;
      if (p.injury.days <= 0) p.injury = null;
    }
  }

  for (const t of state.teams) {
    t.budget = nextBudget(t);
    t.finances = emptyFinances(league.season);
    t.wins = 0;
    t.losses = 0;
    t.runsScored = 0;
    t.runsAllowed = 0;
    t.rotationSlot = 0;
    trimMinors(state, t.id);
    const signed = fillOrgNeeds(state, t.id);
    const moves = fixRoster(org(state, t.id), t.id !== state.userTeamId || !!t.autoRoster);
    if (t.id === state.userTeamId && (moves.length || signed)) {
      addNews(league, {
        kind: 'team',
        title: 'Roster set for the new season',
        body: `${signed ? `${signed} depth player(s) signed to minor league deals. ` : ''}${moves.length} roster move(s) were made automatically to fill out the active roster.`,
        mine: true,
      });
    }
  }
  state.schedule = generateSchedule(state.teams, league.settings.gamesPerSeason, league.season, rng.fork('schedule'));
  state.stats = new Map();
  state.norms = undefined;
  setOwnerTargets(state);
  const owner = league.owner!;
  addNews(league, {
    kind: 'owner',
    title: `The ${league.season} season is almost here`,
    body: `Owner's goal: ${owner.expectation.toLowerCase()} (about ${owner.targetWins} wins).`,
    mine: true,
  });
  return removed;
}

export type ExtendResult = { ok: true } | { ok: false; reason: string };

/** Offer the user's player an extension at his asking terms. */
export function extendPlayer(state: SeasonState, playerId: number): ExtendResult {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.teamId !== state.userTeamId || !p.contract) return { ok: false, reason: 'Not your player.' };
  if (p.contract.years !== 1) return { ok: false, reason: 'Extensions are offered in the final year of a contract.' };
  const team = state.teams.find((t) => t.id === state.userTeamId)!;
  const games = team.wins + team.losses;
  const winPct = games ? team.wins / games : 0.5;
  if (extensionWillingness(p, winPct) < EXTENSION_THRESHOLD) {
    return { ok: false, reason: `${fullName(p)} wants to test free agency.` };
  }
  const terms = extensionTerms(p);
  p.contract = { salary: terms.salary, years: terms.years + 1 };
  addNews(state.league, {
    kind: 'transaction',
    title: `Extended ${fullName(p)}`,
    body: `${terms.years} more year${terms.years > 1 ? 's' : ''} at $${(terms.salary / 1000).toFixed(1)}M per season.`,
    playerId,
    mine: true,
  });
  return { ok: true };
}
