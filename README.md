# Diamond GM

A mobile-first, browser-based baseball management sim inspired by *Out of the Park Baseball*: simple to pick up, deep to master. See [`docs/PLAN.md`](docs/PLAN.md) for the research, feature list and roadmap.

## Install & offline

Diamond GM is a Progressive Web App: open it once in a browser and use "Add to Home Screen" / "Install app". It then works fully offline. Careers live in the browser's IndexedDB; use **Settings → Export career file** to back one up or move it to another device, and **Import career file** on the start screen to load it.

## Deployment

Every push to `master` builds, tests and publishes the app to GitHub Pages via `.github/workflows/deploy.yml` (one-time setup: repo **Settings → Pages → Source: GitHub Actions**). It's served at `https://<owner>.github.io/<repo>/`; relative asset paths and hash-based routing mean no extra configuration is needed.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck and build static files into `dist/` |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest unit tests |

## Architecture

```
src/
  engine/   Pure TypeScript game logic (no DOM). Runs in a Web Worker.
    generate/  league, team and player generation
    sim/       plate appearance model, lineups, single-game simulation
    season/    schedule, season sim, playoffs, offseason, contracts, trades, rosters
  worker/   Comlink API the UI calls into (engine.worker.ts / client.ts).
  db/       IndexedDB persistence via Dexie (one record set per save).
  state/    Zustand stores: loaded save, theme.
  ui/       React screens, layout and components (Tailwind CSS).
```

- **Everything is seeded.** All randomness goes through `Rng`, so a league can be regenerated exactly from its seed.
- **True vs scouted ratings.** The engine stores true ratings; the UI only shows scouted estimates (20–80 scale) with an uncertainty band.
- **Offline & local.** Careers are saved to IndexedDB on the device; no backend.
- **Mobile first.** Bottom tab bar and slide-up sheets on phones; sidebar and dialogs on wider screens.

## Status

- **Phase 0 — Foundation:** done. App shell, league generation, save/load, roster, player sheets, standings, finances overview.
- **Phase 1 — Core sim:** done. Plate-appearance game engine (log5 batter/pitcher matchups, platoon splits, baserunning, steals, double plays, errors, pitcher fatigue and bullpen management, W/L/S decisions), balanced 162-game schedule, season simulation in the worker, box scores with play-by-play, league scores, stat leaders and player season stats. A calibration test keeps league totals MLB-like (≈4.4 R/G, .245 AVG, 22–23% K, ≈4.3 ERA); a full season sims in well under a second.
- **Phase 2 — Playable career:** done. Editable lineup, batting order, positions, rotation and bullpen roles (or let the AI manage); call-ups and options with automatic roster legality. Seeded playoffs (division series, conference series, Diamond Series). A full offseason: season review with WAR-based awards and history, owner review and job security, aging/development/retirements, re-signing, AI-driven free agency, a scouted amateur draft, and a new season. Trades with an AI that values players by age, upside, contract and whether it's contending or rebuilding, with live feedback. News inbox, career stats, budgets.
- **Phase 3 — Depth:** done. Injuries and the injured list (auto call-ups and activations); coaching staff, head trainer and scouting director you can hire and replace; a scouting budget that controls how accurate ratings on other teams' players, free agents and prospects are; service time with automatic pre-arb renewals, arbitration (tender / non-tender) and free agency after six years; contract extensions; a trade finder ("find me a package", shop a player) and AI-initiated trade offers; OPS+, ERA+, FIP, wOBA and WAR. Defense now develops and is normalized by era, keeping league offense stable over decades.
- **Phase 4 — Polish (v1.0):** done. Team strategy dials (baserunning, small ball, starter leash); a live game view where you manage pitch by pitch (steal, bunt, pinch hit, intentional walk, pitching changes); new-league settings (12–30 teams, 60/100/162 games, DH, difficulty); an assistant GM with one-tap suggestions and optional offseason/roster handling; a first-run welcome guide; installable offline PWA; career export/import; visible keyboard focus.
- **Phase 5 — Living league:** done. Player morale (playing time, winning, pay, loyalty) with small performance effects, re-sign refusals and trade requests; tradable draft picks; fan interest, attendance, ticket pricing and revenue-driven budgets; career totals, single-season records, career leaders and a Hall of Fame. Era normalization now also covers speed and starter stamina, keeping league offense steady over 20+ simulated seasons.
- **Trends & smarter suggestions:** per-game logs for your club drive a Trends card on Home — hitless and hitting streaks, 10-game slumps and hot streaks compared with season and career averages (with a luck-vs-decline read from strikeout rate), starters getting hit hard, closer struggles, reliever workload, bullpen ERA over the last 7, offense over the last 10, win/loss streaks, splits vs LHP/RHP starters and one-run games. Each trend offers one-tap responses (rest him, move him in the order, swap the closer, skip a starter, call up a AAA arm, adjust strategy). The player sheet shows recent form: last 7/15 tiles, a rolling 10-game AVG or per-outing ER chart, and the last five games.
- **Rosters, chemistry and the market:**
  - *Real MLB rosters* — New Career → Real MLB starts a league with all 30 clubs and their 40-man rosters. `node scripts/mlb-pack.mjs [season]` refreshes `public/data/mlb.json` from the public MLB Stats API; ratings come from inverting the sim's plate-appearance model over four seasons of MLB/AAA/AA stats (recency-weighted, minor league numbers translated, small samples regressed). Contracts are estimated from service time.
  - *Roster files* — Settings → Export rosters saves every team and player as JSON (`format: "diamond-gm-roster"`); New Career → Import starts a league from one. Edit the file to build your own league; thin organizations are padded with depth.
  - *Free agent market* — stocked to four players per team each spring (veterans, depth, 4-A types) on one-year asks, filterable by position.
  - *Team chemistry* — veteran leaders, troublemakers, trade demands, team mood, winning and roster turnover set a 0–100 chemistry score with a small on-field and morale effect. See it under Front Office → Clubhouse.
  - *Platoons* — sit a hitter against left- or right-handed starters from his player sheet (or from a Trend).
  - Trends also cover platoon splits, home/road records, clubhouse mood and AAA call-up options for slumping hitters.
- **Later (backlog):** 40-man roster and waivers, AA level, international signings, team chemistry, pitch types, All-Star break, commissioner mode, online leagues.
