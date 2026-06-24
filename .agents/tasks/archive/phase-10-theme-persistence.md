# Phase 10: Abstract Theme Persistence

**Branch:** `phase-10-theme-persistence`
**Worktree:** `../basalt-phase10`

## Problem

`ThemeProvider` calls `invoke("get_settings")` and `invoke("set_setting")` directly. This:
- Makes it impossible to render Storybook or test without Tauri
- Couples the provider to specific backend command names
- Violates separation of concerns

## Solution

Inject a `ThemePersistence` interface via props.

## Task List

- [ ] **Step 1:** Define interface in `ThemeProvider.tsx`:
  ```ts
  export interface ThemePersistence {
    load: () => Promise<ThemeId | null>;
    save: (id: ThemeId) => Promise<void>;
  }
  ```
- [ ] **Step 2:** Add optional `persistence` prop to `ThemeProvider`
- [ ] **Step 3:** Move the Tauri `invoke` calls into a default implementation:
  ```ts
  const defaultPersistence: ThemePersistence = {
    load: async () => {
      try {
        const settings = await invoke<Record<string, unknown>>("get_settings");
        return (settings.theme as ThemeId) ?? null;
      } catch { return null; }
    },
    save: async (id) => {
      await invoke("set_setting", { key: "theme", value: id });
    },
  };
  ```
- [ ] **Step 4:** Use the prop or fall back to `defaultPersistence`
- [ ] **Step 5:** Update `main.tsx` to pass `persistence` (or not — default works)
- [ ] **Step 6:** Verify:
  ```bash
  cd apps/tauri && bunx tsc --noEmit
  ```
- [ ] **Step 7:** Commit:
  ```bash
  git add -A && git commit -m "refactor(app-shell): abstract ThemeProvider persistence behind interface"
  ```
