import type React from "react";
import { useTheme } from "./ThemeProvider";

export const ThemeSelect: React.FC = () => {
  const { themeId, setTheme, themes } = useTheme();

  const handleNext = () => {
    const idx = themes.findIndex((t) => t.id === themeId);
    const next = themes[(idx + 1) % themes.length];
    setTheme(next.id);
  };

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--sat-text-muted)]">
      <select
        value={themeId}
        onChange={(e) => setTheme(e.target.value as typeof themeId)}
        className="bg-[var(--sat-surface-2)] border border-[var(--sat-layout-border)] rounded-md px-2 py-1 text-[var(--sat-text-primary)]"
      >
        {themes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleNext}
        className="px-2 py-1 rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] transition-colors"
        title="Cycle theme"
      >
        Next
      </button>
    </div>
  );
};
