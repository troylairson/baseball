import { create } from 'zustand';
import type { LoadedSave } from '../db/saves';
import type { Player, Team } from '../engine';
import { engine } from '../worker/client';

const LAST_SAVE_KEY = 'dgm.lastSave';

interface GameState {
  save: LoadedSave | null;
  loading: boolean;
  load: (saveId: string) => Promise<boolean>;
  close: () => void;
}

export const useGame = create<GameState>((set) => ({
  save: null,
  loading: false,
  load: async (saveId) => {
    set({ loading: true });
    const save = await engine().loadSave(saveId);
    set({ save, loading: false });
    try {
      if (save) localStorage.setItem(LAST_SAVE_KEY, saveId);
      else localStorage.removeItem(LAST_SAVE_KEY);
    } catch {
      // Ignore: only used to auto-resume.
    }
    return save !== null;
  },
  close: () => {
    try {
      localStorage.removeItem(LAST_SAVE_KEY);
    } catch {
      // Ignore.
    }
    set({ save: null });
  },
}));

export function lastSaveId(): string | null {
  try {
    return localStorage.getItem(LAST_SAVE_KEY);
  } catch {
    return null;
  }
}

/** The loaded save. Only call inside screens rendered after a save is loaded. */
export function useSave(): LoadedSave {
  const save = useGame((s) => s.save);
  if (!save) throw new Error('No save loaded');
  return save;
}

export function useUserTeam(): Team {
  const save = useSave();
  return save.teams.find((t) => t.id === save.meta.userTeamId)!;
}

export function teamPlayers(players: Player[], teamId: number): Player[] {
  return players.filter((p) => p.teamId === teamId);
}
