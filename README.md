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
  engine/   Pure TypeScript game logic (no DOM): seeded RNG, data model,
            ratings, scouting, league/player generation. Runs in a Web Worker.
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

Phase 0 (foundation) is complete: app shell, league generation, save/load, roster, player sheets, standings and finances overview. Next up is Phase 1: the game engine, schedule and sim controls.
