"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  resolveTheme,
  type ThemeName,
} from "../lib/theme/theme";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// The document's data-theme attribute is the store (T3d.3-R1). The
// pre-hydration init script is its initial writer; setTheme below is the
// only other writer, and it notifies subscribers synchronously.
const listeners = new Set<() => void>();

function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readThemeSnapshot(): ThemeName {
  return resolveTheme(document.documentElement.getAttribute("data-theme"));
}

function readThemeServerSnapshot(): ThemeName {
  return DEFAULT_THEME;
}

function emitThemeChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

// Appearance-theme state (T3d.3-I, hydration-fixed in T3d.3-R1).
// Independent from SessionProvider: themes never read or write financial
// drafts, results, or AI content.
//
// Hydration safety: useSyncExternalStore renders the server snapshot
// (Natural) during hydration, matching SSR markup exactly, then adopts
// the live document snapshot afterwards. The visible page never flashes:
// the init script already set the correct attribute before first paint,
// so only React's checked-state view catches up post-hydration.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeTheme,
    readThemeSnapshot,
    readThemeServerSnapshot,
  );

  const setTheme = useCallback((next: ThemeName) => {
    document.documentElement.setAttribute("data-theme", next);
    // Appearance preference only. Private-mode / quota failures must not
    // break rendering: the live theme still applies for this visit.
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Intentionally ignored: storage is a best-effort preference cache.
    }
    emitThemeChange();
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
