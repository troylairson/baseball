#!/usr/bin/env node
// Builds public/data/mlb.json: real MLB 40-man rosters with compact stat lines
// (MLB, AAA and AA, last four seasons) from the public MLB Stats API.
// Usage: node scripts/mlb-pack.mjs [season]
import { writeFileSync } from 'node:fs';

const season = Number(process.argv[2] ?? new Date().getFullYear());
const API = 'https://statsapi.mlb.com/api/v1';
const LEVELS = { 1: 'MLB', 11: 'AAA', 12: 'AA' };
const FIRST = season - 3;

// Primary/secondary colors (hex) by team abbreviation.
const COLORS = {
  ARI: ['#A71930', '#E3D4AD'], AZ: ['#A71930', '#E3D4AD'], ATL: ['#13274F', '#CE1141'], BAL: ['#DF4601', '#000000'], BOS: ['#BD3039', '#0C2340'],
  CHC: ['#0E3386', '#CC3433'], CWS: ['#27251F', '#C4CED4'], CIN: ['#C6011F', '#000000'], CLE: ['#00385D', '#E50022'],
  COL: ['#33006F', '#C4CED4'], DET: ['#0C2340', '#FA4616'], HOU: ['#002D62', '#EB6E1F'], KC: ['#004687', '#BD9B60'],
  LAA: ['#BA0021', '#003263'], LAD: ['#005A9C', '#EF3E42'], MIA: ['#00A3E0', '#EF3340'], MIL: ['#12284B', '#FFC52F'],
  MIN: ['#002B5C', '#D31145'], NYM: ['#002D72', '#FF5910'], NYY: ['#0C2340', '#C4CED3'], ATH: ['#003831', '#EFB21E'],
  OAK: ['#003831', '#EFB21E'], PHI: ['#E81828', '#002D72'], PIT: ['#27251F', '#FDB827'], SD: ['#2F241D', '#FFC425'],
  SF: ['#FD5A1E', '#27251F'], SEA: ['#0C2C56', '#005C5C'], STL: ['#C41E3A', '#0C2340'], TB: ['#092C5C', '#8FBCE6'],
  TEX: ['#003278', '#C0111F'], TOR: ['#134A8E', '#1D2D5C'], WSH: ['#AB0003', '#14225A'],
};
// 1 (small) – 5 (large) market by abbreviation.
const MARKET = {
  NYY: 5, NYM: 5, AZ: 3, LAD: 5, LAA: 4, CHC: 5, CWS: 4, BOS: 4, PHI: 4, SF: 4, ATH: 1, OAK: 1, HOU: 4, TEX: 4, ATL: 4, WSH: 4,
  SEA: 3, TOR: 4, DET: 3, MIN: 3, SD: 3, STL: 3, ARI: 3, COL: 3, BAL: 3, CIN: 2, CLE: 2, KC: 2, MIL: 2, PIT: 2, TB: 1, MIA: 2,
};

async function get(path) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${API}${path}`);
      if (!res.ok) throw new Error(`${res.status} ${path}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

const n = (x) => Number(x ?? 0) || 0;
const outsOf = (ip) => { const [w, f = '0'] = String(ip ?? '0').split('.'); return n(w) * 3 + n(f); };

function battingLine(sp, lvl) {
  const s = sp.stat;
  return { y: Number(sp.season), l: lvl, pa: n(s.plateAppearances), ab: n(s.atBats), h: n(s.hits), d: n(s.doubles), t: n(s.triples), hr: n(s.homeRuns),
    bb: n(s.baseOnBalls), so: n(s.strikeOuts), hbp: n(s.hitByPitch), sb: n(s.stolenBases), cs: n(s.caughtStealing), sf: n(s.sacFlies) };
}
function pitchingLine(sp, lvl) {
  const s = sp.stat;
  return { y: Number(sp.season), l: lvl, g: n(s.gamesPlayed), gs: n(s.gamesStarted), bf: n(s.battersFaced), o: outsOf(s.inningsPitched),
    h: n(s.hits), er: n(s.earnedRuns), bb: n(s.baseOnBalls), so: n(s.strikeOuts), hr: n(s.homeRuns), hbp: n(s.hitBatsmen), sv: n(s.saves) };
}

const teamsRes = await get(`/teams?sportId=1&season=${season}&hydrate=division,league`);
const teams = [];
const players = new Map();
for (const t of teamsRes.teams.sort((a, b) => a.id - b.id)) {
  const abbr = t.abbreviation;
  teams.push({
    key: abbr, city: t.franchiseName ?? t.locationName, name: t.clubName ?? t.teamName, abbr,
    colors: COLORS[abbr] ?? ['#334155', '#94a3b8'], market: MARKET[abbr] ?? 3,
    conference: t.league.name, conferenceAbbr: t.league.abbreviation, division: t.division.name.replace(/^(American|National) League /, ''),
  });
  for (const [sportId, lvl] of Object.entries(LEVELS)) {
    const group = sportId === '1' ? '%5Bhitting,pitching,fielding%5D' : '%5Bhitting,pitching%5D';
    const res = await get(`/teams/${t.id}/roster?rosterType=40Man&season=${season}&hydrate=person(stats(type=yearByYear,group=${group},sportId=${sportId}))`);
    for (const entry of res.roster) {
      const p = entry.person;
      let rec = players.get(p.id);
      if (!rec) {
        rec = {
          id: p.id, first: p.useName ?? p.firstName, last: p.useLastName ?? p.lastName, born: p.birthDate,
          bats: p.batSide?.code ?? 'R', throws: p.pitchHand?.code ?? 'R',
          pos: entry.position.abbreviation, team: abbr, status: entry.status?.code ?? 'A', debut: p.mlbDebutDate ?? null,
          bat: [], pit: [], fld: {},
        };
        players.set(p.id, rec);
      }
      for (const s of p.stats ?? []) {
        for (const sp of s.splits) {
          if (Number(sp.season) < FIRST || sp.sport?.id !== Number(sportId)) continue;
          const g = s.group.displayName;
          if (g === 'hitting' && n(sp.stat.plateAppearances) > 0) rec.bat.push(battingLine(sp, lvl));
          else if (g === 'pitching' && n(sp.stat.battersFaced) > 0) rec.pit.push(pitchingLine(sp, lvl));
          else if (g === 'fielding' && sp.position) {
            const pos = sp.position.abbreviation;
            rec.fld[pos] = (rec.fld[pos] ?? 0) + n(sp.stat.gamesPlayed) * (Number(sp.season) >= season - 1 ? 2 : 1);
          }
        }
      }
    }
  }
  process.stderr.write(`${abbr} `);
}
const out = { format: 'mlb-stats-pack', version: 1, season, fetched: new Date().toISOString().slice(0, 10), teams, players: [...players.values()] };
writeFileSync(new URL('../public/data/mlb.json', import.meta.url), JSON.stringify(out));
process.stderr.write(`\n${teams.length} teams, ${players.size} players\n`);
