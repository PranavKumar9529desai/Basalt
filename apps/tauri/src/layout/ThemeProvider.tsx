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

export const ThemeProvider: React.FC<React.PropsWithChildren> = ({
  children,
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

    invoke<Record<string, unknown>>("get_settings")
      .then((settings) => {
        const backendTheme = settings.theme as ThemeId;
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

    invoke("set_setting", { key: "theme", value: themeId }).catch((err) => {
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
