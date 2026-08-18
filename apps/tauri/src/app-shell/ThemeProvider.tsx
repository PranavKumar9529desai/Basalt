import {
  defaultThemeId,
  type ThemeId,
  type ThemeMeta,
  themes,
} from "@workspace/theme/manifest";
import type React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { setSetting, useSetting } from "../features/settings";

type ThemeContextValue = {
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
  themes: ThemeMeta[];
};

const STORAGE_KEY = "basalt.theme";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * ThemeProvider — manages the active theme for the entire app.
 *
 * ## Data flow — initialization
 *
 * 1. **localStorage cache** (sync) — read instantly on mount so the
 *    correct `data-theme` attribute is applied before the first paint.
 *    This avoids a flash of the wrong theme.
 *
 * 2. **Settings store** (reactive) — `useSetting("theme")` subscribes to
 *    the Zustand settings store.  When `initSettings()` runs (after the
 *    Rust boot command resolves), the store updates and this component
 *    re-renders with the authoritative backend value.
 *
 * 3. **Sync to DOM** — the winning value is written to
 *    `document.documentElement.dataset.theme` so CSS custom properties
 *    cascade correctly.
 *
 * ## Data flow — user changes theme
 *
 *   setTheme(id)
 *     → update React state (re-render consumers)
 *     → setSetting("theme", id) → updates settings store + config.json
 *     → localStorage.setItem  → keeps the fast cache in sync
 */
interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Provides the current theme ID and a setter to child components.
 *
 * On mount it resolves the theme in three steps (see module docstring):
 * 1. localStorage (instant, avoids flash)
 * 2. Settings store (reactive, backed by Rust config.json)
 * 3. Sync to DOM `data-theme` attribute
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const storeTheme = useSetting("theme");

  const [themeId, setThemeId] = useState<ThemeId>(defaultThemeId);

  /**
   * Step 1: read localStorage synchronously so the theme is applied
   * before the first paint (no flash).  If nothing is cached, fall
   * back to the system colour-scheme preference.
   */
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (stored && themes.some((t) => t.id === stored)) {
      setThemeId(stored);
    } else {
      const prefersDark = window.matchMedia?.(
        "(prefers-color-scheme: dark)",
      ).matches;
      if (prefersDark && themes.some((t) => t.mode === "dark")) {
        setThemeId("dark" as ThemeId);
      }
    }
  }, []);

  /**
   * Step 2: when the settings store hydrates from the Rust boot result,
   * override the local state if the backend value differs.  The backend
   * is always the source of truth.
   */
  useEffect(() => {
    if (storeTheme && themes.some((t) => t.id === storeTheme)) {
      setThemeId(storeTheme as ThemeId);
    }
  }, [storeTheme]);

  /**
   * Step 3: whenever themeId changes, sync it everywhere —
   * DOM attribute (for CSS), localStorage (for next cold start),
   * and the Rust backend (durable persistence via settings store).
   */
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeId);
    window.localStorage.setItem(STORAGE_KEY, themeId);
    setSetting("theme", themeId);
  }, [themeId]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      setTheme: (id) => setThemeId(id),
      themes,
    }),
    [themeId],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
