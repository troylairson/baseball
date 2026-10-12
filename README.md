# Diamond GM

A mobile-first, browser-based baseball management sim inspired by *Out of the Park Baseball*: simple to pick up, deep to master. See [`docs/PLAN.md`](docs/PLAN.md) for the research, feature list and roadmap.

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
- **Next — Phase 4:** live game view with tactical calls, onboarding tutorial, assistant GM recommendations, difficulty presets, PWA/offline install, save export/import, accessibility and performance passes.
