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
- **Economy and trades:**
  - *Contracts* are priced by projected WAR (about $6.5M per win at the game's payroll scale; relievers at a premium). Young stars command 8–10 year deals; new leagues assign contracts by service time (pre-arbitration, arbitration share, or a market deal with years left).
  - *Free agency* runs in four rounds. You make offers (salary and years); AI clubs bid by need and budget (two-year commitments, a luxury-tax line, spending floors); each player weighs money, years, winning, market size and loyalty, and reads the market between rounds: with no bids he cuts his price (stars the most) and takes a shorter deal, with low bids he moves toward the best one, never below 65% of his opening ask. Owners put 95% of revenue back into payroll and staff, and the tax line sits at 1.6× the league's average payroll (MLB's ratio), so most good free agents sign in the winter; unsigned regulars take one-year deals in spring.
  - *Trade value* is surplus: projected wins over the years of team control, priced, minus salary. Contenders weight this season, rebuilders the future; bad contracts are negative. Each AI club judges players through its own scouts (noisier for other organizations, discounted for uncertainty) and by positional need, and won't give away a good player for nothing.
  - *AI clubs trade with each other*: contenders buy veterans on short deals from rebuilders, mostly near the deadline and in the winter, when both front offices think they win.
- **Animated field:** the live game view plays each plate appearance on a top-down ballpark — pitches with the count, ground balls, fly balls (height shown by lifting the ball off its shadow), throws, relays, double plays, steals, tag-ups and home runs. The engine emits structured play events (batted-ball angle, distance, apex, exit velocity, fielders, runner moves) from a separate cosmetic random stream, so outcomes are unchanged. Speeds: every pitch, each play (default) or instant; tap the field or Skip to finish a play. Reduced-motion devices default to instant. Spec: `docs/ANIMATED_FIELD.md`.
- **Your home screen, your way:** *Customize* (on the team banner) shows, hides, reorders and widens cards and picks 1–3 columns on wide screens; the layout saves with your career. Cards include an **Injured list** (each injury, days left, expected return and who's covering), **Hot & cold** (your hottest and coldest players over the last 15 games or 5 starts against their season), top hitters and pitching leaders, and **Triple-A**. Your farm club plays a real game every day the big club does, against another organization's Triple-A roster with the same engine (on its own random stream, so big league results don't change); its players' lines show on the Triple-A card and their player cards.
- **Home and roster shortcuts:** *Play* opens the next game for you to manage (its arrow quick-sims instead). Home shows your top hitters and pitching leaders (WAR once the season is going), and your Triple-A club with one-tap call-ups; when the active roster is full, a call-up asks who goes down, closest fit first. *Contract decisions* (from the Home to-do, Front Office or the offseason re-sign stage) lists everyone who can leave: how they're playing, what they ask, whether they'll talk, and whether the price is a bargain, fair, risky or an overpay, with one-tap extend, re-sign or let go.
- **Managing live games in a few taps:** *Next decision* plays on until something is worth deciding — your pitcher tiring or in trouble, a save spot, third time through the order, a bench bat with a clear platoon edge, a good steal chance, a bunt or intentional-walk spot, big late moments — and stops with your assistant's call ready in one tap ("Bring in Díaz") or *Keep going*. Standing orders (Live game → Standing orders) handle the routine calls by themselves: send runners above a speed, pull the starter at a pitch count, closer in save spots, pinch-hit for the pitcher late; you choose which moments stop the game. A typical game takes 3–5 stops instead of a tap per batter (~78). *Auto* plays batter by batter at the animation's pace and pauses at decisions. Desktop keys: Space next decision, Enter take the suggestion, N next batter, A autoplay, S/B/H steal/bunt/pinch hit, W/P walk/pitching change, O orders.
- **Pitch types:** every pitcher has a repertoire of two to five pitches (four-seam, sinker, cutter, slider, sweeper, curveball, changeup, splitter, knuckleball), with velocity, usage and a 20–80 grade for each, as your scouts see it on the player sheet. Grades come from the pitcher's ratings plus each pitch's own quality, so they develop with him, and young pitchers sometimes add a pitch in the offseason. The mix matters in the sim: sinkers and splitters get ground balls and keep the ball in the park; changeups and splitters blunt opposite-handed hitters while sliders and sweepers eat up same-side ones; free swingers chase breaking balls and weak-contact hitters can't catch up to velocity; and hitters improve each time through the order, less so against a deep arsenal. League totals are unchanged. The live game shows each pitch's type and speed, and play-by-play names the strikeout pitch.
- **Stats browser:** League → Stats lists every hitter and pitcher (or team totals) with traditional and advanced columns — AVG/OBP/SLG/OPS, OPS+, wOBA, BB%, K%, WAR; W-L, SV, holds, blown saves, quality starts, IP, ERA, WHIP, K/9, BB/9, HR/9, FIP, ERA+. Sort by any column; filter by season (past seasons included), regular season or postseason, team and position; toggle the rate-stat qualifier (3.1 PA or 1 IP per team game). Players traded mid-season are split by club when filtering by team, and their player sheet shows each club's line plus the postseason. League → Leaders has twelve boards a side, each with "See all" into the table.
- **Rosters, chemistry and the market:**
  - *Real MLB rosters* — New Career → Real MLB starts a league with all 30 clubs and their 40-man rosters. `node scripts/mlb-pack.mjs [season]` refreshes `public/data/mlb.json` from the public MLB Stats API; ratings come from inverting the sim's plate-appearance model over four seasons of MLB/AAA/AA stats (recency-weighted, minor league numbers translated, small samples regressed). Contracts: 113 major guaranteed deals are real (from public reporting as of spring 2026, `src/engine/generate/mlbContracts.ts`; edit or add rows there); everyone else gets a realistic estimate — pre-arbitration and arbitration players on one-year deals under team control (some young stars extended), veterans partway through deals signed at what they were worth then. Player sheets show "Team control thru 20XX" for players who can't leave yet.
  - *Roster files* — Settings → Export rosters saves every team and player as JSON (`format: "diamond-gm-roster"`); New Career → Import starts a league from one. Edit the file to build your own league; thin organizations are padded with depth.
  - *Free agent market* — stocked to four players per team each spring (veterans, depth, 4-A types) on one-year asks, filterable by position.
  - *Team chemistry* — veteran leaders, troublemakers, trade demands, team mood, winning and roster turnover set a 0–100 chemistry score with a small on-field and morale effect. See it under Front Office → Clubhouse.
  - *Platoons* — sit a hitter against left- or right-handed starters from his player sheet (or from a Trend).
  - Trends also cover platoon splits, home/road records, clubhouse mood and AAA call-up options for slumping hitters.
- **Later (backlog):** 40-man roster and waivers, AA level, international signings, All-Star break, commissioner mode, online leagues.
