## Goal

Deliver per-pane editor support so Basalt renders an independent editor instance per visible split (left/right/top/bottom), mirroring Obsidian/VS Code semantics while preserving the three-layer architecture and ensuring we don’t regress lint/TS checks.

## Scope

- Keep UI primitives in `packages/ui`.
- Feature state (layout tree, pane registry) in `apps/tauri/src/features/tabs`.
- Layout composition limited to `WorkspaceTabs` + any new shell helpers.
- Delegate heavy I/O/parsing to `basalt_core`/`basalt_fs`.

## Step-by-step plan

1. **Map current responsibilities & finalize layout model**
   - Status: [x]  
   - Deliverable: Document which modules own layout/group state versus editor state, and ensure `layoutRoot` tree + group metadata already capture left/right vs top/bottom splits.  
   - Notes:
     - Layout/group state lives entirely in `apps/tauri/src/features/tabs/*`: `types.ts` defines `TabLayoutNode` with `axis`/`split` semantics, `store/layout.ts` manages the normalized tree, `store/helpers.ts` boots `layoutRoot`, and `workspaceSlice.ts` persists `layoutRoot` with `groupOrder`/`focusedGroupId`.
     - Shell composition in `apps/tauri/src/routes/index.tsx` wires `WorkspaceTabs`, the activity bar, and the sidebar while delegating to `apps/tauri/src/features/tabs/components/WorkspaceTabs.tsx` for layout traversal and `useTabs` for group/tab data.
     - Editor state (content, autosave, conflicts, backlinks, wikilink navigation) resides entirely in `apps/tauri/src/features/editor/hooks/useEditor.ts`; `WorkspaceTabs` currently passes a single `UseEditorReturn` to whichever pane is focused instead of per-pane instances.
     - UI primitives (tabs, buttons, scroll areas, etc.) live in `packages/ui` and are composed in `WorkspaceTabs`. Colors already flow through `--sat-*` tokens (e.g., `TabGroupFrame` wrappers).
     - Layout axis already captures left/right vs top/bottom splits (row = horizontal, column = vertical), so the tree can distinguish split directions once each leaf group is associated with a pane context.
   - SOP: Once this step feels stable, run `bun run lint` and `bunx tsc --noEmit`.

2. **Design a PaneManager/registry**
   - Status: [x]  
   - Deliverable: Introduce a layer that maps `TabLayoutNode` leaves to pane IDs, instantiates a dedicated `useEditor` per pane, and exposes APIs for wallet (tab activation, focus). Keep the renderer dumb—`WorkspaceTabs` purely walks the layout tree and renders whichever pane component the manager supplies.  
   - Notes: Captured the intended inputs/outputs, lifecycle, and renderer contract inside the new “PaneManager sketch” section.
   - SOP: After wiring the manager but before editor-heavy state changes, run `bun run lint` and `bunx tsc --noEmit`.

3. **Instantiate per-pane editors**
   - Status: [x]  
   - Deliverable: For each pane, mount an editor(s) that keeps its own selected tab, content, save/conflict status, and autopersistence, while sharing parsed data via the Rust backend. Ensure editors can unregister when their pane disappears.  
   - Notes:
     - `WorkspaceTabs` now computes a `WorkspaceTabsGroupRenderContext` per group and lets callers override group rendering; the default renderer still matches the previous focused-pane experience.
     - Introduced `usePaneManager` in `apps/tauri/src/app-shell/panes` which supplies `renderGroupPane` hooks, instantiates `useEditor` per pane, and wires the DnD helpers, `TabsBar`, and `Editor` instances inside a `PaneInstance`.
     - Each pane keeps its own `UseEditorReturn` (autosave, conflict banner, backlink fetch) and marks its active tab dirty when the editor content changes; unmounting a pane closes its editor to clean up listeners.
   - SOP: Upon finishing this implementation, rerun `bun run lint` and `bunx tsc --noEmit`.

4. **Wire commands & persistence**
   - Status: [x]  
   - Deliverable: Adapt command palette actions, tab move/split flows, and workspace snapshots so they know about pane IDs and update the layout tree plus focused pane accordingly. Persist the layout/active pane alongside tabs, and ensure restoration recreates the editors.  
   - Notes:
     - Workspace snapshots now include a `paneFocus` block (`focusedPaneId`) in addition to the existing `focusedGroupId`, and hydration prefers the stored pane focus so reloading the layout restores the previously active pane.
     - `PaneInstance` now calls `onActivateGroup` when the editor pane is clicked so the focused pane updates before command palette actions or splits run.
     - Tab drag split-target drops now inspect the drop axis and only create a new split when the target pane isn’t already under that axis, preventing nested splits (top → top, left → left) and collapsing the source pane when it becomes empty.
   - SOP: After these flows pass manual verification, run `bun run lint` and `bunx tsc --noEmit`.

5. **Performance & Rust delegation**
   - Status: [ ]  
   - Deliverable: Verify autosave/backlinks pause/resume per pane, and push file loading/saving/markdown parsing/links to `basalt_core`/`basalt_fs` commands (e.g., batched `open_files`, `save_files`). Document any APIs needed on the Rust side for layout snapshots or reuse.  
   - SOP: Final smoke check with `bun run lint` and `bunx tsc --noEmit` before merge.

## Additional notes

- Always annotate files near `packages/ui` vs `apps/tauri` boundaries to avoid mixing layers.  
- Keep new modules small (single responsibility) to satisfy “high separation of concerns.”  
- Update workspace snapshot format with `layout` & `paneFocus` fields so reloads restore multi-pane focus.

## Architecture snapshot

- **Layout & group graph** (`apps/tauri/src/features/tabs/types.ts`, `store/layout.ts`, `store/helpers.ts`, `store/slices/workspaceSlice.ts`): `TabLayoutNode` already models both row/column splits and leaf `groupId`s, the layout helpers normalize/prune the tree, and workspace snapshots persist `layoutRoot` alongside `groupOrder`/`focusedGroupId`.
- **Feature state** (`apps/tauri/src/features/tabs/*`): `useTabs` exposes groups, tabs, active tab maps, and commands (open, split, close, move) while `WorkspaceTabs` uses `TabGroupFrame`, `TabsBar`, and DnD helpers to render each leaf group according to the layout tree.
- **Editor state** (`apps/tauri/src/features/editor/hooks/useEditor.ts`): owns selected note, content, autosave timers, file I/O (via `invoke("open_file")`, `save_file`, `get_backlinks"`), conflict detection, and autocomplete/backlink fetch helpers. Currently a single instance is injected into the focused pane.
- **Shell composition** (`apps/tauri/src/routes/index.tsx`): orchestrates the activity bar, sidebar, file tree, command palette, and passes the `useEditor` instance plus tab callbacks into `WorkspaceTabs`, keeping layout rendering scoped to the feature and respecting the three-layer architecture.

## PaneManager sketch

- **Goal**: Map each `TabLayoutGroupNode` leaf to a `paneId`, spin up a dedicated `useEditor` hook for that pane, and expose the pane-specific editor + focus APIs to the shell so `WorkspaceTabs` only has to render the tree.
- **Inputs**:
  - `layoutRoot` and `focusedGroupId` from `useTabs`.
  - Tab callbacks (`activateTab`, `setFocusedGroup`, `togglePinTab`, `splitGroupWithTab`, etc.) either forwarded from the tabs feature or re-exposed by the manager.
  - `findNote` resolver from the vault feature so each editor can resolve wikilinks.
- **Outputs** (example API):
  ```ts
  interface PaneInfo {
    paneId: string;
    groupId: TabGroupId;
    isFocused: boolean;
    activeTab: TabModel | null;
    editor: UseEditorReturn;
    onTabSelect: (tabId: TabId) => void;
    onActivatePane: () => void;
  }

  interface UsePaneManagerReturn {
    getPaneInfo: (groupId: TabGroupId) => PaneInfo | null;
    focusedPaneId: string | null;
  }
  ```
- **Lifecycle**: Each leaf gets its own `<PaneInstance />` child that calls `useEditor`. Mounting/unmounting is driven by the layout tree walker in `WorkspaceTabs`, so `useEditor` uses consistent hook ordering even as splits open/close.
- **Renderer contract**: `WorkspaceTabs` stays layout-only: when it hits a group node it calls `renderPane(groupId)` (supplied by the manager) which already knows how to build the `TabGroupFrame`, `TabsBar`, and editor content for that pane. The manager also keeps the `paneFocus` metadata that will eventually persist alongside `layout` in workspace snapshots.
