import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generate/league';
import { overall } from '../model/ratings';
import type { Player } from '../model/types';
import { playerValue } from './value';
import { rosterIssues } from './roster';
import { Rng } from '../rng';
import { acceptOffer, evaluateTrade, executeTrade, maybeMakeOffer, shopPlayer, suggestPackage } from './trades';

function ctx(seed: number) {
  const { league, teams, players } = generateLeague(seed);
  return { league, teams, players, userTeamId: 0 };
}
const mlb = (players: Player[], teamId: number) => players.filter((p) => p.teamId === teamId && p.level === 'MLB');
const best = (list: Player[]) => [...list].sort((a, b) => overall(b) - overall(a))[0]!;
const worst = (list: Player[]) => [...list].sort((a, b) => overall(a) - overall(b))[0]!;

describe('trades', () => {
  it('rejects a lopsided ask for their best player', () => {
    const c = ctx(1);
    const ev = evaluateTrade(c, { partnerId: 1, give: [worst(mlb(c.players, 0)).id], get: [best(mlb(c.players, 1)).id] });
    expect(ev.accepted).toBe(false);
    expect(ev.score).toBeLessThan(0.6);
  });

  it('accepts when they clearly win the deal, and keeps rosters legal', () => {
    const c = ctx(2);
    const ev = evaluateTrade(c, { partnerId: 1, give: [best(mlb(c.players, 0)).id], get: [worst(mlb(c.players, 1)).id] });
    expect(ev.accepted).toBe(true);
    const res = executeTrade(c, { partnerId: 1, give: [best(mlb(c.players, 0)).id], get: [worst(mlb(c.players, 1)).id] });
    expect(res.ok).toBe(true);
    for (const t of [0, 1]) expect(rosterIssues(mlb(c.players, t))).toEqual([]);
  });

  it('cannot be fleeced with a pile of spare parts', () => {
    const c = ctx(3);
    const star = best(mlb(c.players, 1));
    const junk = [...mlb(c.players, 0)].sort((a, b) => overall(a) - overall(b)).slice(0, 5);
    const ev = evaluateTrade(c, { partnerId: 1, give: junk.map((p) => p.id), get: [star.id] });
    expect(ev.accepted).toBe(false);
  });

  it('never takes a strictly worse player for a better one', () => {
    const c = ctx(4);
    for (let partner = 1; partner < 8; partner++) {
      for (const mine of mlb(c.players, 0)) {
        for (const theirs of mlb(c.players, partner)) {
          const worse = overall(mine) < overall(theirs) - 2 && mine.age >= theirs.age && (mine.contract?.salary ?? 0) >= (theirs.contract?.salary ?? 0)
            && (mine.contract?.years ?? 0) >= (theirs.contract?.years ?? 0) && mine.position === theirs.position;
          if (!worse) continue;
          expect(evaluateTrade(c, { partnerId: partner, give: [mine.id], get: [theirs.id] }).accepted).toBe(false);
        }
      }
    }
  });

  it('values cheap control over an expensive contract for the same player', () => {
    const c = ctx(8);
    const p = best(mlb(c.players, 1));
    const cheap = { ...p, contract: { salary: 900, years: 4 }, experience: 1 };
    const pricey = { ...p, contract: { salary: 45000, years: 4 }, experience: 9 };
    expect(playerValue(cheap, true)).toBeGreaterThan(playerValue(pricey, true) + 50);
    expect(playerValue(pricey, false)).toBeLessThan(0);
  });

  it('respects the trade deadline', () => {
    const c = ctx(5);
    c.league.phase = 'regular';
    c.league.date = `${c.league.season}-08-15`;
    const ev = evaluateTrade(c, { partnerId: 1, give: [best(mlb(c.players, 0)).id], get: [worst(mlb(c.players, 1)).id] });
    expect(ev.accepted).toBe(false);
    expect(ev.message).toMatch(/deadline/);
  });
});

describe('trade finder and offers', () => {
  it('suggests a package the partner accepts', () => {
    const c = ctx(6);
    const target = [...mlb(c.players, 1)].sort((a, b) => overall(b) - overall(a))[2]!;
    const pkg = suggestPackage(c, 1, [target.id]);
    expect(pkg).not.toBeNull();
    expect(evaluateTrade(c, { partnerId: 1, give: pkg!, get: [target.id] }).accepted).toBe(true);
  });

  it('shops a player to teams that would take him', () => {
    const c = ctx(7);
    const mine = best(mlb(c.players, 0));
    const offers = shopPlayer(c, mine.id);
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) expect(evaluateTrade(c, { partnerId: o.partnerId, give: [mine.id], get: o.get }).accepted).toBe(true);
  });

  it('AI teams make offers during the season that can be accepted', () => {
    const c = ctx(8);
    c.league.phase = 'regular';
    c.league.date = `${c.league.season}-05-01`;
    let offer = null;
    for (let i = 0; i < 200 && !offer; i++) offer = maybeMakeOffer(c, new Rng(i));
    expect(offer).not.toBeNull();
    expect(c.league.offers).toHaveLength(1);
    expect(acceptOffer(c, offer!.id).ok).toBe(true);
    expect(c.players.find((p) => p.id === offer!.get[0])!.teamId).toBe(0);
    expect(c.league.offers).toHaveLength(0);
  });
});

describe('draft pick trades', () => {
  it('values picks, moves ownership, and carries it into the draft order', async () => {
    const { picksOwnedBy, pickId } = await import('./picks');
    const c = ctx(9);
    // Make team 1 look like a rebuilder with a top pick.
    for (const t of c.teams) { t.wins = 50; t.losses = 50; }
    c.teams[1]!.wins = 30;
    c.teams[1]!.losses = 70;
    const theirFirst = pickId({ season: c.league.season, round: 1, originalTeamId: 1 });
    // A young, high-ceiling player is what a rebuilder wants for a top pick.
    const myPlayer = best(mlb(c.players, 0).filter((p) => !p.pitching));
    myPlayer.age = 23;
    myPlayer.battingPotential = { contact: 72, power: 72, eye: 70, speed: myPlayer.batting.speed };
    myPlayer.contract = { salary: 900, years: 4 };
    const ev = evaluateTrade(c, { partnerId: 1, give: [myPlayer.id], get: [], getPicks: [theirFirst] });
    expect(ev.accepted).toBe(true);
    const cheap = worst(mlb(c.players, 0));
    expect(evaluateTrade(c, { partnerId: 1, give: [cheap.id], get: [], getPicks: [theirFirst] }).accepted).toBe(false);
    {
      expect(executeTrade(c, { partnerId: 1, give: [myPlayer.id], get: [], getPicks: [theirFirst] }).ok).toBe(true);
      expect(picksOwnedBy(c.league, c.teams, 0).some((p) => p.originalTeamId === 1 && p.round === 1)).toBe(true);
      expect(picksOwnedBy(c.league, c.teams, 1).some((p) => p.originalTeamId === 1 && p.round === 1)).toBe(false);
    }
  });
});
