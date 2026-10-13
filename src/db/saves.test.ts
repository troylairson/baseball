import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, generateLeague } from '../engine';
import { GameDB } from './db';
import { createSave, deleteSave, exportCareer, importCareer, listSaves, loadSave } from './saves';

// fake-indexeddb is slow, so keep test leagues small.
const SMALL = { ...DEFAULT_SETTINGS, teamCount: 4, conferences: 1, divisionsPerConference: 1 };

describe('saves', () => {
  it('round-trips a generated league', async () => {
    const db = new GameDB('test-roundtrip');
    const generated = generateLeague(77, SMALL);
    const meta = await createSave(db, generated, { userTeamId: 3, seed: 77 });

    const loaded = await loadSave(db, meta.id);
    expect(loaded?.meta.userTeamId).toBe(3);
    expect(loaded?.teams).toEqual(generated.teams);
    expect(loaded?.players).toEqual(generated.players);
    expect(loaded?.league).toEqual(generated.league);
    expect((await listSaves(db)).map((s) => s.id)).toEqual([meta.id]);

    await deleteSave(db, meta.id);
    expect(await loadSave(db, meta.id)).toBeNull();
    expect(await db.players.count()).toBe(0);
  });

  it('keeps saves isolated from each other', async () => {
    const db = new GameDB('test-isolation');
    const a = await createSave(db, generateLeague(1, SMALL), { userTeamId: 0, seed: 1 });
    const b = await createSave(db, generateLeague(2, SMALL), { userTeamId: 1, seed: 2 });
    await deleteSave(db, a.id);
    const loaded = await loadSave(db, b.id);
    expect(loaded?.players.length).toBeGreaterThan(0);
  });

  it('exports and re-imports a career', async () => {
    const db = new GameDB('test-export');
    const meta = await createSave(db, generateLeague(5, SMALL), { userTeamId: 2, seed: 5 });
    const file = await exportCareer(db, meta.id);
    const json = JSON.parse(JSON.stringify(file));
    const imported = await importCareer(db, json);
    expect(imported.id).not.toBe(meta.id);
    const a = await loadSave(db, meta.id);
    const b = await loadSave(db, imported.id);
    expect(b?.players).toEqual(a?.players);
    expect(b?.schedule).toEqual(a?.schedule);
    expect(b?.meta.userTeamId).toBe(2);
    await expect(importCareer(db, { hello: 'world' })).rejects.toThrow(/not a Diamond GM career/);
  });
});
