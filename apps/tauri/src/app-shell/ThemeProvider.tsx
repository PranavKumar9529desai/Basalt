import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  themes,
  defaultThemeId,
  type ThemeId,
  type ThemeMeta,
} from "@workspace/ui/theme/manifest";

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

  // On mount, hydrate from storage or prefers-color-scheme
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (stored && themes.some((t) => t.id === stored)) {
      setThemeId(stored);
      return;
    }

    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark && themes.some((t) => t.mode === "dark")) {
      setThemeId("dark" as ThemeId);
    }
  }, []);

  // Apply data-theme attribute and persist
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeId);
    window.localStorage.setItem(STORAGE_KEY, themeId);
  }, [themeId]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      setTheme: (id) => setThemeId(id),
      themes,
    }),
    [themeId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
