# Task: Separate WorkspaceInit and WorkspaceView

## Goal

Split `WorkspaceView` into two components with distinct responsibilities:
- **`WorkspaceInit`** — one-time initialization (settings hydration, tab persistence restore)
- **`WorkspaceView`** — pure UI layout (reads from Zustand stores, renders chrome, cross-feature wiring)

## Why

`WorkspaceView` currently mixes two concerns:
1. Initialization logic that runs once on mount (`initSettings`, `useTabPersistence`)
2. Layout composition that runs on every render (ActivityBar, Sidebar, Tabs, RightSidebar, Overlays)

Splitting them makes `WorkspaceView` easier to reason about and test — it becomes a pure layout that reads from stores.

## Architecture Principle

> **Boot data is a seed, not a runtime dependency.** `BootResult` flows through
> `WorkspaceInit` exactly once to hydrate Zustand stores. After initialization,
> all components read from stores directly. There is no second source of truth —
> the store IS the truth after init.

## Design Decision: What moves to WorkspaceInit?

Two things in WorkspaceView depend on boot data:
1. `initSettings(boot.settings)` — plain function, easy to move
2. `useTabPersistence({ workspace: boot.workspace })` — React hook, needs boot.workspace

Two things depend on boot data but MUST stay in WorkspaceView:
1. `useVaultTree(boot.tree)` — manages local UI state (`openFolders`) that must live in the rendering component
2. Command registration — depends on `controller` from `useWorkspaceSidebar` (runtime hook data)

**Decision:** Move only `initSettings` and `useTabPersistence` to `WorkspaceInit`. Keep everything else in `WorkspaceView`. `WorkspaceInit` passes `boot` (the full object) to `WorkspaceView` so it can call `useVaultTree(boot.tree)`.

**Why not thread tree results as props?** `useVaultTree` returns 7 values (treeNodes, visibleNodes, openFolders, toggleFolder, openFolder, refreshTree, setTreeNodes). Threading all of them as props defeats the purpose of the split — it creates more boilerplate than it removes.

**Why pass the full `boot` object?** Because `WorkspaceView` needs `boot.tree` for `useVaultTree` and `boot.vault_path` for the splash screen. Passing `boot` directly is simpler than destructuring it in `WorkspaceInit` and passing individual fields. The boot object is never stored in a Zustand store — it's consumed and discarded.

## Files to Change

### 1. NEW: `apps/tauri/src/app-shell/WorkspaceInit.tsx` (~40 lines)

```tsx
/**
 * WorkspaceInit — Workspace initialization boundary.
 *
 * Architecture: This component owns the ONE-TIME initialization of all features.
 * It receives the raw BootResult from the Rust backend and orchestrates:
 *   1. Settings hydration (initSettings)
 *   2. Tab persistence restore (useTabPersistence)
 *
 * After initialization, all components read from Zustand stores directly.
 * BootResult is a SEED, not a runtime dependency — it flows through here
 * exactly once and is never stored in a Zustand store (no dual source of truth).
 *
 * This component renders WorkspaceView as its ONLY child, passing the full
 * boot object so WorkspaceView can seed useVaultTree(boot.tree). The boot
 * object is NOT stored — it's consumed and discarded.
 *
 * Note: Command registration for vault actions (app:new-file, app:delete-file)
 * stays in WorkspaceView because those commands depend on `controller` from
 * useWorkspaceSidebar, which is a runtime hook result — not boot data.
 */
import type { BootResult } from "../features/vault";
import { initSettings } from "../features/settings";
import { useTabPersistence } from "../features/tabs";
import { WorkspaceView } from "./WorkspaceView";

interface WorkspaceInitProps {
  boot: BootResult;
}

export function WorkspaceInit({ boot }: WorkspaceInitProps) {
  // ── 1. Settings hydration ────────────────────────────────────────────────
  // Plain function call — reads boot.settings once and writes to the Zustand
  // settings store. Idempotent: calling again with same data is a no-op.
  initSettings(boot.settings);

  // ── 2. Tab persistence ───────────────────────────────────────────────────
  // Restores the previous session's tab layout from boot.workspace on mount,
  // then debounces saves back to Rust on structural mutations.
  // Needs boot.workspace to seed the hydration — cannot be moved to stores.
  useTabPersistence({ workspace: boot.workspace });

  // ── Render ───────────────────────────────────────────────────────────────
  // WorkspaceView is a pure layout — reads from stores, receives boot for
  // vault tree initialization (useVaultTree needs boot.tree).
  return <WorkspaceView boot={boot} />;
}
```

### 2. MODIFY: `apps/tauri/src/app-shell/WorkspaceView.tsx` (~200 lines, down from 221)

Changes:
- Remove `initSettings(boot.settings)` call (moved to WorkspaceInit)
- Remove `useTabPersistence(...)` call (moved to WorkspaceInit)
- Remove `import { initSettings }` and `import { useTabPersistence }`
- Add docstring explaining this is a pure layout component
- Keep `boot` prop — WorkspaceView still needs `boot.tree` for `useVaultTree` and `boot.vault_path` for splash screen
- Keep command registration `useEffect` — it depends on `controller` from useWorkspaceSidebar (runtime hook data, not boot data)

Key docstring:

```tsx
/**
 * WorkspaceView — Pure workspace layout.
 *
 * Architecture: This component is responsible ONLY for composing the visual
 * layout of the workspace. It reads feature state from Zustand stores via
 * hooks (useTabs, useVaultTree, useFocusedPaneStore) — it does NOT perform
 * any initialization or persistence.
 *
 * All initialization is owned by WorkspaceInit (parent). This component
 * receives boot as a prop solely to seed useVaultTree(boot.tree) — the
 * boot object is never stored in a Zustand store.
 *
 * Cross-feature wiring (vault ↔ tabs ↔ editor) happens here via shell
 * hooks (useWorkspaceSidebar, useWorkspaceTabHandlers) — this is the
 * ONLY place where features are composed together.
 *
 * Command registration for vault actions (app:new-file, app:delete-file)
 * lives here because those commands depend on `controller` from
 * useWorkspaceSidebar — runtime hook data, not boot seed data.
 */
```

### 3. MODIFY: `apps/tauri/src/routes/index.tsx`

Change from:
```tsx
import { WorkspaceView } from "../app-shell";
// ...
return <WorkspaceView boot={boot} />;
```
To:
```tsx
import { WorkspaceInit } from "../app-shell";
// ...
return <WorkspaceInit boot={boot} />;
```

### 4. MODIFY: `apps/tauri/src/app-shell/index.ts`

Add export for `WorkspaceInit`.

## Implementation Steps

1. Create `WorkspaceInit.tsx` with the docstring and initialization logic extracted from `WorkspaceView`
2. Modify `WorkspaceView.tsx`: remove `initSettings` call, remove `useTabPersistence` call, remove related imports, add docstring
3. Update `routes/index.tsx` to render `WorkspaceInit` instead of `WorkspaceView`
4. Update `app-shell/index.ts` to export `WorkspaceInit`
5. Run `bun run lint && bunx tsc --noEmit` to verify

## What NOT to change

- `useWorkspaceSidebar.ts` — stays as-is, still called from WorkspaceView
- `useWorkspaceTabHandlers.ts` — stays as-is, still called from WorkspaceView
- `useTabPersistence.ts` — stays as-is, just called from WorkspaceInit instead
- `useVaultTree.ts` — stays as-is, still called from WorkspaceView
- No stores modified, no new stores created

## Verification

- `bun run lint` passes
- `bunx tsc --noEmit` passes
- App boots correctly (settings restore, tab restore, file tree renders)
- Command palette shows all commands
- Tab persistence works (close app, reopen, tabs restored)
