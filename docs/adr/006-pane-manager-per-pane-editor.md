# ADR-006: PaneManager — One Editor Instance Per Visible Pane

**Status:** Accepted  
**Date:** 2026-04-04  
**Implemented in:** [Editor-Per-Pane.md](../../Editor-Per-Pane.md)

## Context

The original implementation passed a single `useEditor` instance to whichever pane was focused. This broke split-pane semantics: switching focus between panes would unmount/remount the editor, losing scroll position, selection state, and autosave timers. With multiple visible panes, there was no way to have two notes open and independently editable simultaneously.

## Decision

Introduce `usePaneManager` in `apps/tauri/src/app-shell/panes/` as an intermediary layer.

**Responsibilities:**
- Maps each `TabLayoutNode` leaf (group ID) to a stable `paneId`
- Spins up a dedicated `useEditor` hook instance per pane via `<PaneInstance />` children
- Exposes `getPaneInfo(groupId)` and `focusedPaneId` to the shell
- Persists `paneFocus` alongside `layoutRoot` in workspace snapshots

**Key rules:**
- `WorkspaceTabs` stays layout-only — it walks the tree and calls `renderGroupPane(groupId)`, supplied by the manager
- Each `PaneInstance` mounts its own `useEditor`, autosave timers, conflict detection, and backlink fetch
- Unmounting a pane closes its editor and cleans up listeners
- One editor instance per visible pane — NOT one per tab (tabs share an editor within a pane, swapping content on activation)

## Consequences

+ Each split has independent editor state — scroll position, selection, dirty status, autosave
+ Focus switching between panes is instant; no remount
+ Workspace snapshots restore exact multi-pane focus on restart
- `usePaneManager` must be the single source of truth for pane lifecycle; shell must not spin up editors directly
- Hook ordering inside `PaneInstance` must remain consistent even as splits open/close (handled by tree walker)
- Per-pane autosave/backlinks must pause/resume correctly when panes are hidden (Phase 5, pending)
