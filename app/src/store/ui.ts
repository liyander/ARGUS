import { create } from 'zustand';
import { setGithubToken } from '../sources/github';

type Theme = 'dark' | 'light';

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function initialTheme(): Theme {
  try {
    const t = localStorage.getItem('stackscope-theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* ignore */
  }
  return 'dark';
}

interface UiState {
  theme: Theme;
  paletteOpen: boolean;
  tokenOpen: boolean;
  shareOpen: boolean;
  hasToken: boolean;
  /** element of the current view, for PNG export */
  viewEl: HTMLElement | null;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setPalette: (open: boolean) => void;
  setTokenOpen: (open: boolean) => void;
  setShareOpen: (open: boolean) => void;
  saveToken: (token: string | null) => void;
  setViewEl: (el: HTMLElement | null) => void;
}

const initialToken = readSession('stackscope-gh-token');
setGithubToken(initialToken);

export const useUi = create<UiState>((set, get) => ({
  theme: initialTheme(),
  paletteOpen: false,
  tokenOpen: false,
  shareOpen: false,
  hasToken: Boolean(initialToken),
  viewEl: null,
  setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('stackscope-theme', theme);
    } catch {
      /* ignore */
    }
    set({ theme });
  },
  toggleTheme() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setTokenOpen: (tokenOpen) => set({ tokenOpen }),
  setShareOpen: (shareOpen) => set({ shareOpen }),
  saveToken(token) {
    setGithubToken(token);
    try {
      if (token) sessionStorage.setItem('stackscope-gh-token', token);
      else sessionStorage.removeItem('stackscope-gh-token');
    } catch {
      /* ignore */
    }
    set({ hasToken: Boolean(token) });
  },
  setViewEl: (viewEl) => set({ viewEl }),
}));
