import { invoke } from "@tauri-apps/api/core";
import {
  defaultThemeId,
  type ThemeId,
  type ThemeMeta,
  themes,
} from "@workspace/theme/manifest";
import type React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeContextValue = {
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
  themes: ThemeMeta[];
};

const STORAGE_KEY = "basalt.theme";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// --------------------------------------------------------------------------
// Theme persistence interface — allows injecting a custom backend (or none)
// without coupling ThemeProvider to Tauri invoke().
// --------------------------------------------------------------------------

export interface ThemePersistence {
  load: () => Promise<ThemeId | null>;
  save: (id: ThemeId) => Promise<void>;
}

const defaultPersistence: ThemePersistence = {
  load: async () => {
    try {
      const settings = await invoke<Record<string, unknown>>("get_settings");
      return (settings.theme as ThemeId) ?? null;
    } catch {
      return null;
    }
  },
  save: async (id) => {
    await invoke("set_setting", { key: "theme", value: id });
  },
};

interface ThemeProviderProps {
  children: React.ReactNode;
  persistence?: ThemePersistence;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  persistence = defaultPersistence,
}) => {
  const [themeId, setThemeId] = useState<ThemeId>(defaultThemeId);

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

    persistence
      .load()
      .then((backendTheme) => {
        if (
          backendTheme &&
          themes.some((t) => t.id === backendTheme) &&
          backendTheme !== themeId
        ) {
          setThemeId(backendTheme);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch settings from backend:", err);
      });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeId);
    window.localStorage.setItem(STORAGE_KEY, themeId);

    persistence.save(themeId).catch((err) => {
      console.error("Failed to persist theme to backend:", err);
    });
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
