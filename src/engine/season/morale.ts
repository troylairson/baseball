import { battingOverall, isPitcher, overall, pitchingOverall } from '../model/ratings';
import type { Player } from '../model/types';
import { contractDemand, contractStatus } from './contracts';
import { addNews } from './news';
import { NEUTRAL_CHEMISTRY, updateChemistry } from './chemistry';
import type { SeasonState } from './season';

export interface MoraleFactor {
  label: string;
  /** Points added to (or taken from) a neutral 50. */
  value: number;
}

export const NEUTRAL_MORALE = 50;
const DAYS_BETWEEN_UPDATES = 7;

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/** Role a player expects from his place on the depth chart. */
function expectsRegularRole(p: Player, teammates: Player[]): boolean {
  if (isPitcher(p)) {
    if (p.position === 'SP') {
      const sps = teammates.filter((x) => x.position === 'SP').sort((a, b) => pitchingOverall(b.pitching!, true) - pitchingOverall(a.pitching!, true));
      return sps.indexOf(p) < 5;
    }
    return true; // Relievers expect to pitch regularly.
  }
  const hitters = teammates.filter((x) => !isPitcher(x)).sort((a, b) => battingOverall(b.batting) - battingOverall(a.batting));
  return hitters.indexOf(p) < 9;
}

/** Why a player feels the way he does. Positive values lift morale. */
export function moraleFactors(p: Player, state: Pick<SeasonState, 'teams' | 'players' | 'stats'>): MoraleFactor[] {
  if (p.teamId === null || p.retired) return [];
  const team = state.teams.find((t) => t.id === p.teamId);
  if (!team) return [];
  const factors: MoraleFactor[] = [];
  const games = team.wins + team.losses;

  if (games >= 10) {
    const v = Math.round((team.wins / games - 0.5) * 60);
    if (Math.abs(v) >= 2) factors.push({ label: v > 0 ? 'Enjoying a winning team' : 'Frustrated by losing', value: v });
  }

  const org = state.players.filter((x) => x.teamId === team.id && !x.retired && !x.injury);
  if (p.level === 'AAA') {
    const peers = org.filter((x) => x.level === 'MLB' && (isPitcher(p) ? x.position === p.position : !isPitcher(x)));
    const worst = Math.min(...peers.map((x) => overall(x)));
    if (peers.length && overall(p) >= worst + 3 && p.age >= 24) factors.push({ label: 'Believes he belongs in the majors', value: -12 });
  } else if (games >= 15 && !p.injury) {
    const s = state.stats.get(p.id);
    const expects = expectsRegularRole(p, org.filter((x) => x.level === 'MLB'));
    const playing = isPitcher(p)
      ? p.position === 'SP' ? (s?.pit.gs ?? 0) >= games / 7 : (s?.pit.g ?? 0) >= games / 5
      : (s?.bat.pa ?? 0) >= games * 2.6;
    if (expects && !playing) factors.push({ label: 'Wants more playing time', value: -15 });
    else if (!expects && playing) factors.push({ label: 'Happy with his playing time', value: 6 });
  }

  if (p.contract && contractStatus(p) !== 'pre-arb' && p.contract.years > 0) {
    const fair = contractDemand(p).salary;
    if (p.contract.salary < fair * 0.6) {
      factors.push({ label: 'Feels underpaid', value: -Math.round(4 + Math.max(0, p.personality.greed - 50) / 5) });
    }
  }
  if (p.personality.loyalty >= 65) factors.push({ label: 'Loyal to the club', value: 6 });
  if (p.level === 'MLB') {
    const chem = team.chemistry ?? NEUTRAL_CHEMISTRY;
    if (chem >= 70) factors.push({ label: 'Loves this clubhouse', value: 5 });
    else if (chem <= 28) factors.push({ label: 'Toxic clubhouse', value: -4 });
  }
  return factors;
}

export function moraleTarget(p: Player, state: Pick<SeasonState, 'teams' | 'players' | 'stats'>): number {
  const sum = moraleFactors(p, state).reduce((s, f) => s + f.value, 0);
  return Math.max(5, Math.min(95, NEUTRAL_MORALE + sum));
}

/** Small performance effect: happy players play a touch better, miserable ones worse. */
export function moraleRatingBonus(morale: number | undefined): number {
  const m = morale ?? NEUTRAL_MORALE;
  return m >= 75 ? 1 : m <= 25 ? -2 : m <= 35 ? -1 : 0;
}

export function moraleLabel(morale: number | undefined): 'Happy' | 'Content' | 'Unhappy' | 'Miserable' {
  const m = morale ?? NEUTRAL_MORALE;
  return m >= 65 ? 'Happy' : m >= 40 ? 'Content' : m >= 25 ? 'Unhappy' : 'Miserable';
}

/** Expiring free-agent-eligible players who are unhappy won't re-sign. */
export function refusesToResign(p: Player): boolean {
  return contractStatus(p) === 'free-agent' && (p.morale ?? NEUTRAL_MORALE) < 30;
}

/** Drift everyone's morale toward its target once a week; unhappy users' players may ask out. */
export function updateMorale(state: SeasonState, force = false): void {
  const { league } = state;
  if (!force && league.moraleDate && daysBetween(league.moraleDate, league.date) < DAYS_BETWEEN_UPDATES) return;
  league.moraleDate = league.date;
  updateChemistry(state);
  for (const p of state.players) {
    if (p.teamId === null || p.retired) continue;
    const target = moraleTarget(p, state);
    const current = p.morale ?? NEUTRAL_MORALE;
    p.morale = Math.round(current + (target - current) * 0.3);
    if (p.teamId === state.userTeamId) {
      if (p.morale < 25 && !p.tradeRequested) {
        p.tradeRequested = true;
        addNews(league, {
          kind: 'team',
          title: `${p.firstName} ${p.lastName} wants out`,
          body: `${moraleFactors(p, state).filter((f) => f.value < 0).map((f) => f.label).join('; ') || 'Unhappy with his situation'}. He has asked for a trade.`,
          playerId: p.id,
          mine: true,
        });
      } else if (p.morale >= 40 && p.tradeRequested) {
        p.tradeRequested = false;
      }
    }
  }
}
