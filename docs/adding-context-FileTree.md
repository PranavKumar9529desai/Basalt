
## Context Menu Implementation Plan (Folder + Note)

Goal: Add Obsidian/VSCode-style right-click menus for folder and note nodes in the file tree.
Scope for working commands in v1: `create`, `delete`, `cut`, `paste`.
Scope for static commands in v1: other visible menu entries render but are disabled/no-op.

### 1) Product Scope (v1)

Folder context menu (working):
- New note
- New folder
- Cut
- Paste
- Delete

Note context menu (working):
- Cut
- Paste (for move target folder context only; disabled directly on note in v1)
- Delete

Folder + note menus (static placeholders):
- Open variants, rename, copy path, reveal in explorer, etc.
- Render consistent UI, but no backend mutation.

### 2) Architecture Boundaries

`packages/ui` (Primitives only):
- Presentational context menu components (Radix/shadcn based).
- No app logic, no Tauri APIs, no mutation state.

`apps/tauri/src/features/vault` (Feature logic):
- Menu state and command dispatcher (`useVaultContextMenu` hook).
- Clipboard state for cut/paste (`useVaultClipboard` hook).
- Selection-aware command targeting (single and multi-select compatible).

`apps/tauri/src/app-shell` (Shell wiring):
- Inject right-click handlers and menu anchors into file tree composition.
- Pass callbacks and state from feature hooks.

`apps/tauri/src-tauri/src` (Backend commands):
- Add/extend commands for move/copy semantics as needed for cut/paste.
- Keep path validation and vault-boundary checks in Rust.

### 3) Command Semantics

Create:
- Folder target: creates item inside clicked folder.
- Note target: creates item inside note's parent folder.
- Root target: creates at vault root.

Delete:
- Single and multi-select aware.
- Confirmation dialog required before execution.
- If selected note is open in editor and deleted, close editor tab/state.

Cut:
- Stores source path(s) in in-memory clipboard state with operation type `cut`.
- Visual indicator in tree rows for cut items (reduced opacity or marker).

Paste:
- Enabled only when clipboard has entries and target is a valid destination folder.
- Move operation from source -> destination.
- Name collision behavior for v1: fail fast with explicit error per item.

### 4) Data Model

Feature-side clipboard model:
- `operation: "cut" | null`
- `items: Array<{ path: string; isFolder: boolean }>`
- `timestamp: number` (optional for future UX policies)

Context menu state model:
- `anchor: { x: number; y: number } | null`
- `targetNodeId: string | null`
- `targetKind: "file" | "folder" | "root" | null`

### 5) Implementation Phases

Phase A: UI plumbing
- Add right-click event propagation from tree rows.
- Build folder and note menu components with all required entries.
- Mark non-v1 commands as disabled/static.

Phase B: Feature hooks
- Implement `useVaultContextMenu` for open/close/position/target tracking.
- Implement `useVaultClipboard` for cut/paste state transitions.
- Wire menu command handlers to existing mutation hooks.

Phase C: Backend support
- Add Rust command(s) for move path(s) safely within vault.
- Guard against invalid paths, cross-vault moves, and recursive folder moves.
- Emit watcher-compatible change events after mutations.

Phase D: Integration and refresh
- Refresh tree and maintain expanded folders after create/delete/paste.
- Keep selection and focused node consistent after actions.

Phase E: Static command contract
- Keep placeholder commands visible but disabled.
- Add TODO labels/comments mapping each static command to future work.

### 6) Edge Cases to Handle

- Pasting folder into itself or descendant (must reject).
- Pasting into non-folder target (disabled or reroute to parent folder by rule).
- Multi-item paste where one fails (report partial failure clearly).
- Name conflicts with existing files/folders.
- Hidden/system directories should remain excluded from tree policy.

### 7) Testing Plan

Unit (frontend):
- Selection -> context target resolution.
- Cut/paste state transitions.
- Menu enable/disable rules by node type and clipboard state.

Unit (Rust):
- Move validation: vault boundary, self/descendant checks, conflict handling.

Integration:
- Right-click folder -> New note/New folder/Delete/Cut/Paste flows.
- Right-click note -> Cut/Delete flow.
- Tree refresh and watcher event consistency after each mutation.

### 8) Definition of Done (v1)

- Folder and note context menus open at cursor with correct command sets.
- `create`, `delete`, `cut`, `paste` function correctly with validation.
- Non-v1 commands are present but static/disabled.
- No Tauri imports in `packages/ui`.
- Tree, selection, and editor state remain consistent after mutations.
