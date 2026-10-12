import type { ScheduledGame, Team } from '../model/types';
import type { Rng } from '../rng';

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Last Thursday of March of the given season. */
export function openingDay(season: number): string {
  const d = new Date(Date.UTC(season, 2, 31, 12));
  while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Round-robin schedule built from three-game series (circle method). Every
 * team plays exactly `gamesPerSeason` games, never twice on the same day, with
 * an off day after every two series. With an odd number of teams, byes mean
 * totals can differ by up to one series.
 */
export function generateSchedule(teams: Team[], gamesPerSeason: number, season: number, rng: Rng): ScheduledGame[] {
  const ids = rng.shuffle(teams.map((t) => t.id));
  if (ids.length % 2) ids.push(-1); // bye
  const n = ids.length;
  const rounds: [number, number][][] = [];
  const rotating = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const circle = [ids[0]!, ...rotating];
    const pairs: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = circle[i]!;
      const b = circle[n - 1 - i]!;
      pairs.push([a, b]);
    }
    rounds.push(pairs);
    rotating.unshift(rotating.pop()!);
  }

  const games: ScheduledGame[] = [];
  const played = new Map<number, number>(ids.map((id) => [id, 0]));
  const homeGames = new Map<number, number>(ids.map((id) => [id, 0]));
  let date = openingDay(season);
  let id = 1;
  for (let cycle = 0, series = 0; cycle < 100 && teams.every((t) => played.get(t.id)! < gamesPerSeason); cycle++) {
    for (const round of rounds) {
      const remaining = Math.min(...teams.map((t) => gamesPerSeason - played.get(t.id)!));
      if (remaining <= 0) break;
      const length = Math.min(3, remaining);
      // Host each series at whichever team has had fewer home games so far.
      const hosts = round.map(([a, b]) => (homeGames.get(a)! <= homeGames.get(b)! ? [a, b] : [b, a]) as [number, number]);
      for (const [h] of hosts) homeGames.set(h, homeGames.get(h)! + length);
      for (let day = 0; day < length; day++) {
        for (const [homeId, awayId] of hosts) {
          if (homeId < 0 || awayId < 0) continue;
          const [a, b] = [homeId, awayId];
          games.push({ id: id++, date, homeId, awayId, played: false, homeScore: null, awayScore: null, innings: null });
          played.set(a, played.get(a)! + 1);
          played.set(b, played.get(b)! + 1);
        }
        date = addDays(date, 1);
      }
      if (++series % 2 === 0) date = addDays(date, 1);
    }
  }
  return games;
}
