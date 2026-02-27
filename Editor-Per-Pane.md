## Goal

Deliver per-pane editor support so Basalt renders an independent editor instance per visible split (left/right/top/bottom), mirroring Obsidian/VS Code semantics while preserving the three-layer architecture and ensuring we don’t regress lint/TS checks.

## Scope

- Keep UI primitives in `packages/ui`.
- Feature state (layout tree, pane registry) in `apps/tauri/src/features/tabs`.
- Layout composition limited to `WorkspaceTabs` + any new shell helpers.
- Delegate heavy I/O/parsing to `basalt_core`/`basalt_fs`.

## Step-by-step plan

1. **Map current responsibilities & finalize layout model**
   - Status: [ ]  
   - Deliverable: Document which modules own layout/group state versus editor state, and ensure `layoutRoot` tree + group metadata already capture left/right vs top/bottom splits.  
   - SOP: Once this step feels stable, run `bun run lint` and `bunx tsc --noEmit`.

2. **Design a PaneManager/registry**
   - Status: [ ]  
   - Deliverable: Introduce a layer that maps `TabLayoutNode` leaves to pane IDs, instantiates a dedicated `useEditor` per pane, and exposes APIs for wallet (tab activation, focus). Keep the renderer dumb—`WorkspaceTabs` purely walks the layout tree and renders whichever pane component the manager supplies.  
   - SOP: After wiring the manager but before editor-heavy state changes, run `bun run lint` and `bunx tsc --noEmit`.

3. **Instantiate per-pane editors**
   - Status: [ ]  
   - Deliverable: For each pane, mount an editor(s) that keeps its own selected tab, content, save/conflict status, and autopersistence, while sharing parsed data via the Rust backend. Ensure editors can unregister when their pane disappears.  
   - SOP: Upon finishing this implementation, rerun `bun run lint` and `bunx tsc --noEmit`.

4. **Wire commands & persistence**
   - Status: [ ]  
   - Deliverable: Adapt command palette actions, tab move/split flows, and workspace snapshots so they know about pane IDs and update the layout tree plus focused pane accordingly. Persist the layout/active pane alongside tabs, and ensure restoration recreates the editors.  
   - SOP: After these flows pass manual verification, run `bun run lint` and `bunx tsc --noEmit`.

5. **Performance & Rust delegation**
   - Status: [ ]  
   - Deliverable: Verify autosave/backlinks pause/resume per pane, and push file loading/saving/markdown parsing/links to `basalt_core`/`basalt_fs` commands (e.g., batched `open_files`, `save_files`). Document any APIs needed on the Rust side for layout snapshots or reuse.  
   - SOP: Final smoke check with `bun run lint` and `bunx tsc --noEmit` before merge.

## Additional notes

- Always annotate files near `packages/ui` vs `apps/tauri` boundaries to avoid mixing layers.  
- Keep new modules small (single responsibility) to satisfy “high separation of concerns.”  
- Update workspace snapshot format with `layout` & `paneFocus` fields so reloads restore multi-pane focus.
