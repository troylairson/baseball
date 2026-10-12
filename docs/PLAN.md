# Baseball GM Sim — Research, Feature List & Plan

A web-based baseball management sim inspired by *Out of the Park Baseball* (OOTP). Goal: **simple to pick up, deep to master, clean and mobile-first.**

---

## 1. Research: What OOTP Does

OOTP (current release: OOTP 27, March 2026) is the genre benchmark. Its systems, summarized:

| Area | What OOTP offers |
|---|---|
| **Game modes** | Franchise/career mode (real MLB or fictional leagues), historical seasons, custom leagues, *Perfect Team* (online card-collecting mode), 3D/2D in-game view, World Baseball Classic (27). |
| **Player ratings** | Batting (contact, gap, power, eye, avoid K), pitching (stuff, movement, control, individual pitch grades, stamina), defense by position, speed/baserunning. Current **and** potential ratings. Selectable scales (1–20, 20–80 scout scale, 1–100, stars). |
| **Scouting** | Ratings shown are *scouted* opinions, not truth. Accuracy depends on scouting budget (split across MLB/minors/amateur/international) and the scouting director's skill. |
| **Player development** | Slow, realistic progression; aging curves; coaches influence growth; monthly development report showing risers/fallers; injuries affect development. |
| **Roster & org** | 40-man roster, active roster, full minor-league system (AAA → Rookie), call-ups/options, DFA, waivers, Rule 5 draft, injured list. |
| **Contracts** | Arbitration, free agency, team/player/vesting options, no-trade clauses, minor-league deals, extensions, service time. |
| **Draft & amateurs** | Amateur draft with signing bonuses, slotting/bonus pools, player demands; international free agency. |
| **Trades** | Trade AI that values players by role, contract, and team context; trade block, trade finder, difficulty settings (27 overhauled trade AI). |
| **Finances** | Revenue (gate, media, merch, playoffs), expenses (payroll, staff, scouting, development, draft), budgets set by owner, owner goals and job security. |
| **Staff** | Manager, bench coach, pitching/hitting coaches, scouting director, trainers — each with ratings and personalities. |
| **In-game strategy** | Lineups, depth charts, pitching staff roles, platoons, per-game tactical calls (steal, bunt, hit-and-run, IBB, shifts, pitching changes) or let the AI manager run it. |
| **Simulation** | Pitch-by-pitch engine; sim a day/week/month/season; auto-play with configurable AI involvement. |
| **Stats & history** | Exhaustive stats (27 added Statcast-style: exit velo, barrel %, xwOBA, run values), leaderboards, awards, Hall of Fame, league history, almanac. |
| **Immersion** | News feed, player personalities/morale, injuries, team chemistry, fan interest, storylines. |
| **Customization** | League structure, rules (DH, etc.), financial model, AI aggressiveness, ratings visibility, commissioner mode. |

### What players praise
- Enormous depth and realism; stats/history obsession; long-term dynasty building.
- Scouting uncertainty ("you don't really know what you have").
- Ability to play at any level of involvement (micromanage or GM-only).

### What players criticize
- **Alpine-steep learning curve**; daunting for new players.
- Dense, desktop-centric interface; information overload; deep menu trees.
- Loading screens / slow sims; little guidance on *what matters*.
- Requires solid baseball knowledge to enjoy.

**Our opportunity:** keep OOTP's strategic core (scouting uncertainty, development, contracts, org depth) but surface it through a focused, mobile-first UI with progressive disclosure and clear "what should I do next" guidance.

---

## 2. Design Pillars

1. **Simple surface, deep systems.** Every screen leads with a summary; detail is one tap away, never forced.
2. **Meaningful decisions, not busywork.** Automate the tedious (AI handles minors, default lineups) with opt-in control.
3. **Uncertainty is the game.** Scouted ratings, development variance, and injuries make decisions bets, not math problems.
4. **Mobile-first, thumb-friendly.** Built for a phone in one hand; scales up to tablet/desktop.
5. **Fast.** A full season sims in seconds; no loading screens.
6. **Offline & local.** Runs entirely in the browser; saves to the device; installable as a PWA.

---

## 3. Feature List

Priority: **P0** = MVP, **P1** = v1.0, **P2** = post-launch.

### 3.1 League & Modes
- **P0** Fictional league generator (e.g., 2 leagues × 2 divisions, 16–30 teams, configurable).
- **P0** Single franchise career (you are GM of one team).
- **P1** League settings: team count, schedule length (60/100/162), DH rule, playoff format.
- **P1** Multiple save slots; export/import save file (JSON).
- **P2** Commissioner mode (edit anything), historical/real-roster import via data packs.
- **P2** Async online leagues (shared league with friends).

### 3.2 Players & Ratings
- **P0** Compact rating model (deliberately smaller than OOTP):
  - Hitters: *Contact, Power, Eye, Speed, Defense* (+ position eligibility & arm).
  - Pitchers: *Stuff, Control, Movement, Stamina* (+ handedness, role preference).
- **P0** Current and **Potential** ratings on the **20–80 scout scale** (with optional stars view).
- **P0** Age, handedness, position, injury proneness (hidden), personality traits (work ethic, leadership, greed, loyalty).
- **P1** Pitch repertoire (2–5 pitches with grades) feeding the sim.
- **P1** Platoon splits (vs L/R).
- **P2** Hidden "makeup" traits revealed over time.

### 3.3 Scouting
- **P0** All displayed ratings are scouted estimates with error proportional to scouting quality.
- **P0** Confidence indicator per player (e.g., ±range bar) — visually communicates uncertainty.
- **P1** Scouting budget + scouting director rating controlling accuracy.
- **P1** Assign scouts to focus areas (draft, international, pro, a specific player).
- **P2** Scout personalities/biases (e.g., overrates tools, underrates pitchers).

### 3.4 Player Development & Aging
- **P0** Season-end + mid-season progression toward potential with variance; aging curves (peak ~27, decline after ~31).
- **P0** "Risers & Fallers" report.
- **P1** Coaching staff and playing time affect growth; work ethic modifies growth.
- **P1** Development focus per prospect (e.g., "work on power").
- **P2** Breakouts/busts events with narrative.

### 3.5 Roster & Organization
- **P0** Active roster (26) + one minor-league affiliate (AAA-like pool).
- **P0** Call-up / send-down; injured list.
- **P1** 40-man roster, options, DFA & waivers.
- **P1** Two-tier minors (AAA, AA) + rookie complex.
- **P2** Rule 5 draft, full minor-league chain with affiliate sims.

### 3.6 Contracts & Free Agency
- **P0** Contracts: salary × years; expiration → free agency.
- **P0** Free agency bidding with AI teams (player picks best offer weighed by money, years, team contention, loyalty).
- **P1** Pre-arb / arbitration / FA service-time tiers.
- **P1** Extensions mid-contract; player mood affects willingness.
- **P1** Options (team/player), no-trade clauses.
- **P2** Agents, qualifying offers, luxury tax.

### 3.7 Draft & Amateurs
- **P0** Annual amateur draft (snake/reverse-standings order), scouted draft class, auto-draft option.
- **P1** Draft board with tiers, sleeper flags; signing bonuses with bonus pool.
- **P1** International amateur signings window.
- **P2** Draft lottery, compensation picks.

### 3.8 Trades
- **P0** Propose trades (players + cash); AI evaluates value by ratings, age, contract, and team needs (contender vs rebuilder).
- **P0** Clear trade feedback ("They want more pitching" / value meter), not opaque rejections.
- **P1** Trading block, "Find me a deal" trade finder, AI-initiated offers.
- **P1** Trade deadline; draft picks tradable.
- **P2** Multi-team trades, waiver trades.

### 3.9 Finances & Owner
- **P0** Simple budget: revenue (attendance, media, playoffs) vs payroll; budget cap set by owner.
- **P0** Owner goals (e.g., "make playoffs", "cut payroll", "develop youth") → job security meter.
- **P1** Ticket pricing, fan interest, market size, stadium.
- **P1** Staff and scouting budgets as expense levers.
- **P2** Getting fired / hired elsewhere (career mode across teams).

### 3.10 Staff
- **P1** Manager (tactics tendencies), hitting & pitching coaches (development bonuses), scouting director, head trainer (injury recovery).
- **P2** Staff market, hiring/firing, staff aging and ambitions.

### 3.11 Team Strategy (Manager Layer)
- **P0** Lineups vs RHP/LHP (auto-generate with one tap, drag to reorder).
- **P0** Depth chart / defensive positions.
- **P0** Pitching staff: 5-man rotation, closer, setup, middle relief, long relief.
- **P0** Team strategy sliders (few, impactful): *Aggressiveness on bases, Bunting/small ball, Bullpen usage (quick hook ↔ let starters work), Platoon usage*.
- **P1** Per-player instructions (e.g., "don't steal", "pitch count limit").
- **P2** Defensive shifts / positioning.

### 3.12 Game Simulation
- **P0** Plate-appearance-level engine (outcome probabilities from batter vs pitcher ratings, park, fatigue, handedness) — fast enough to sim a 162-game season in < 5 seconds.
- **P0** Sim controls: next game / week / month / to date / to end of season.
- **P0** Box scores & play-by-play log for every game.
- **P1** **Live game mode**: watch a game pitch-by-pitch with a clean diamond graphic and make calls (pitching change, pinch hit, steal, bunt, IBB).
- **P1** Fatigue, rest days, injuries during games.
- **P2** Pitch-level engine (counts, pitch types) and park factors by stadium dimensions.

### 3.13 Season Structure
- **P0** Regular season schedule, standings, playoffs, champion.
- **P0** Offseason phases: awards → arbitration/retirements → draft → free agency → progression → new season.
- **P1** All-Star break, trade deadline, September call-ups.
- **P2** Spring training with position battles.

### 3.14 Stats, History & Awards
- **P0** Standard stats (AVG/OBP/SLG/OPS, HR, RBI, SB; ERA, WHIP, K/9, BB/9, IP, W/L, SV).
- **P0** Team & league leaderboards.
- **P1** Advanced stats: wOBA, OPS+, ERA+, FIP, WAR (simplified).
- **P1** Awards (MVP, Cy Young, ROY, Gold Glove), league history, team history, career stats.
- **P2** Hall of Fame, records book, player career charts.

### 3.15 Information & Guidance (anti-OOTP-overwhelm)
- **P0** **GM Inbox / News feed**: injuries, milestones, trade offers, contract demands, owner messages — each actionable.
- **P0** **Dashboard "To-Do" cards**: "Your closer is injured — set a new one", "3 players' contracts expire", etc.
- **P0** Contextual tooltips explaining every rating & stat.
- **P1** Assistant GM recommendations (optional): suggested lineup, trade targets, draft picks.
- **P1** Onboarding tutorial for the first in-game week.
- **P2** Difficulty presets (scouting accuracy, AI trade savvy, owner patience).

### 3.16 Personality & Chemistry
- **P1** Player morale (playing time, contract, team success) affecting performance slightly and contract talks.
- **P2** Clubhouse chemistry, leaders, clashing personalities.

### 3.17 Platform & UX
- **P0** Mobile-first responsive layout; bottom tab nav on phones, sidebar on desktop.
- **P0** Light/dark theme.
- **P0** Local autosave (IndexedDB).
- **P1** Installable PWA, fully offline.
- **P1** Accessibility: color-blind-safe rating colors, screen-reader labels, 44px touch targets.
- **P2** Cloud sync / account.

---

## 4. UX & Mobile Design

### Navigation
- **Phone:** bottom tab bar with 5 tabs — **Home · Roster · Games · Front Office · League**. A persistent top bar shows team, record, date, and a big **Sim ▶** button (long-press for sim options).
- **Tablet/desktop:** collapsible left sidebar with the same 5 sections; content uses multi-column layouts.

| Tab | Contents |
|---|---|
| Home | To-do cards, inbox, next game, standings snippet, owner meter |
| Roster | Active roster, lineup, depth chart, pitching staff, minors, injuries |
| Games | Schedule, live game, box scores, results |
| Front Office | Trades, free agency, draft, contracts, finances, scouting, staff |
| League | Standings, leaders, stats, transactions, history, awards |

### Key UI patterns
- **Player cards** instead of wide tables on mobile: name, pos, age, OVR/POT badges, 3–4 key ratings as bars, one stat line. Tap → full player sheet (slide-up panel).
- **Tables** on mobile: sticky first column (player name), horizontal scroll for stats, column presets ("Standard / Advanced / Ratings").
- **Ratings visual language:** 20–80 values with color ramp (blue → gray → red, color-blind safe) and a faint uncertainty band from scouting.
- **Drag-and-drop lineups** with large handles; "Auto" button always available.
- **Bottom sheets** for actions (trade, sign, release) — thumb-reachable, confirm before irreversible actions.
- **Progressive disclosure:** summary first, "More" expands advanced detail.
- **Typography-led clean design:** one sans-serif family, tabular numerals for stats, generous spacing, minimal chrome.

---

## 5. Technical Architecture

### Stack
| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Shared types between sim engine and UI; safety for complex data. |
| Build | **Vite** | Fast dev, simple config. |
| UI | **React 18** + **React Router** | Ecosystem, familiarity. |
| Styling | **Tailwind CSS** + CSS variables for theme tokens | Fast, consistent, mobile-first utilities. |
| State | **Zustand** for UI state; game state lives in the worker/DB | Lightweight. |
| Persistence | **IndexedDB via Dexie** | Large saves (thousands of players, stats) offline. |
| Simulation | **Web Worker** running the engine (via **Comlink**) | Keeps UI at 60fps during long sims. |
| Randomness | Seeded PRNG (e.g., mulberry32 / sfc32) | Reproducible sims, testable, debuggable. |
| PWA | **vite-plugin-pwa** | Offline + installable. |
| Testing | **Vitest** (engine/unit), **Playwright** (mobile-viewport E2E) | |
| Hosting | Static hosting (GitHub Pages / Netlify / Vercel) | No backend needed for MVP. |

### Code layout
```
src/
  engine/            # pure TS, no DOM — runs in worker & tests
    rng.ts
    model/           # Player, Team, League, Contract, Game types
    generate/        # names, players, teams, league, draft classes
    sim/             # plate appearance, game, season, injuries, fatigue
    ai/              # AI GM: lineups, trades, FA, draft, roster moves
    progression/     # development, aging, retirement
    finance/
    scouting/        # true ratings -> scouted ratings
    offseason/       # phase machine
  worker/            # Comlink API exposing engine commands
  db/                # Dexie schema, save/load
  ui/
    components/      # PlayerCard, RatingBar, StatTable, BottomSheet...
    screens/         # Home, Roster, Games, FrontOffice, League, Player
    hooks/
  styles/
```

### Key engine design
- **True vs scouted ratings:** engine stores true ratings; UI only ever receives scouted views computed from (true rating, scouting quality, player-specific seed) so values are stable but noisy.
- **Plate appearance model:** log5-style odds ratio combining batter, pitcher, and league averages for K, BB, HBP, 1B, 2B, 3B, HR, out-in-play; then baserunning/defense resolve advancement. Calibrate against real MLB league-average rates.
- **Game state machine** emits events (pitch/PA/inning) → used for both instant sim and live view.
- **Calendar/phase machine** drives the season: preseason → regular season → deadline → playoffs → offseason phases.
- **Player value function** (shared by trade AI, FA, and draft): projects WAR over contract years from scouted ratings & age, minus salary, adjusted for team context.
- **Performance budget:** full season sim < 5s on a mid-range phone; stat aggregation incremental rather than recomputed.

---

## 6. Roadmap

> **Status:** Phases 0–3 are complete (see README). Phase 4 is next.

### Phase 0 — Foundation (week 1)
- Vite + React + TS + Tailwind scaffold; lint/format/test setup; CI.
- App shell: responsive nav (bottom tabs / sidebar), theming, routing.
- Seeded RNG, core data model types, Dexie schema.

### Phase 1 — Core Sim (weeks 2–3)
- League/team/player generator.
- Plate-appearance and game engine; box scores; calibration tests (league AVG ≈ .245, ERA ≈ 4.2, etc.).
- Season schedule, standings, sim controls in a Web Worker.

### Phase 2 — Playable MVP (weeks 4–6)
- Roster, lineup, depth chart, pitching staff screens (with Auto).
- Player cards & player sheet; stats & leaderboards.
- Playoffs; offseason loop: progression/aging, retirements, contracts expiring, simple FA, draft.
- Basic trades with value feedback; simple finances & owner goals.
- Home dashboard with to-do cards & inbox.
- **Milestone:** play multiple seasons end-to-end on a phone.

### Phase 3 — Depth (weeks 7–10)
- Scouting system with uncertainty bands, budgets, director.
- Arbitration/service time, extensions, options; 40-man & waivers.
- Two-tier minors; development focus; staff.
- Trade block, trade finder, AI-initiated offers, deadline.
- Advanced stats, awards, history.

### Phase 4 — Polish & Live (weeks 11–13)
- Live game view with tactical calls.
- Onboarding tutorial, assistant GM, difficulty presets.
- PWA/offline, accessibility pass, performance tuning, save import/export.
- **Milestone:** v1.0.

### Post-launch (P2)
- Commissioner mode, chemistry, pitch-level sim, Hall of Fame, real-roster data packs, online leagues.

---

## 7. Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Sim realism (stats look wrong) | Calibration test suite comparing season aggregates to MLB baselines; tune constants centrally. |
| Trade AI exploitable | Single shared value function; fuzz tests trying to "fleece" the AI; contextual demands. |
| Performance on phones | Engine in worker, typed arrays for hot paths, incremental stats, profile early on a real device. |
| Scope creep toward OOTP-level complexity | Hold to design pillars; every feature must earn its UI space; P0/P1/P2 gating. |
| Save data loss (browser storage) | Request persistent storage, autosave, export/import file. |

---

## 8. Open Questions
- Fictional only, or support real MLB data packs later (licensing implications)?
- Single-player only, or plan for shared/online leagues (would require a backend)?
- Live game view: abstract diagram only, or animated field?
- Monetization (if any): free, one-time, or none?

---

### Research sources
- [OOTP 27 feature overview — Bleacher Report](https://www.bleacherreport.com/articles/25396739-out-park-baseball-27-trailer-drops-includes-world-baseball-classic-more-new-features)
- [OOTP 27 launch — One More Game](https://onemoregame.ph/2026/02/out-of-the-park-baseball-27-launch/)
- [OOTP Developments](https://www.ootpdevelopments.com/ootp-pre-order/)
- [OOTP 15 review — GM Games](https://gmgames.org/out-of-the-park-baseball-ootp-2015/review/)
- [OOTP 13 review — FanGraphs](https://not.fangraphs.com/ootp-13-review-best-baseball-video-game-ever)
- [OOTP 14 review — The Hardball Times](https://tht.fangraphs.com/out-of-the-park-14-a-review)
- [OOTP review — PC Gamer](https://pcgamer.com/out-of-the-park-baseball-review)
- [OOTP 11 preview — OSFTW](https://www.osftw.com/previews/98/improvements-everywhere-in-ootp-11)
