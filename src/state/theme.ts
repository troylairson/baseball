import { create } from 'zustand';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'dgm.theme';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1120' : '#f4f5f7');
}

interface ThemeState {
  pref: ThemePref;
  setPref: (pref: ThemePref) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  pref: readPref(),
  setPref: (pref) => {
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      // Storage unavailable (private mode); preference lasts this session only.
    }
    apply(pref);
    set({ pref });
  },
}));

export function initTheme() {
  apply(useTheme.getState().pref);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => apply(useTheme.getState().pref));
}
