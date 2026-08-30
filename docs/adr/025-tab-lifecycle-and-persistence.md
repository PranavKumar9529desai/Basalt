# ADR-025: Tab Lifecycle and Workspace Persistence

**Status:** Accepted (2026-08-31)
**Date:** 2026-08-31
**Extends:** ADR-018 (registry-driven workbench), ADR-020 (desktop-tier performance)

## Context

The tab strip is the primary navigation surface of the editor. A tab is more
than a visual label: it owns an open document identity, preview state, pin
state, dirty state, leaf type, ordering, and the active selection of its pane.

The previous implementation had several correctness gaps:

- active-tab changes were not persisted, so restart could open a different
  note than the one the user was viewing;
- closing an active tab always selected the last remaining tab, causing a
  large jump in the strip;
- the serialized tab contract did not declare `leafType`, even though graph
  and future leaf tabs require it for restoration;
- tab overflow showed only the first tabs, allowing the active tab to be
  hidden;
- tab keyboard focus did not implement standard tab-list navigation.

Obsidian's workspace model treats tabs and leaves as persistent workspace
state, while its desktop editor supports live preview/source modes and moving
tabs between tab groups and windows. Basalt currently has one pane, but its
tab contract must not make those future extensions unsafe.

## Decision

### Tab identity and ordering

- A tab has a stable `id` for the lifetime of the open item. File moves and
  renames update `path` and title without rekeying the tab.
- `pane.tabIds` is the source of truth for visual order. The `tabs` map is an
  indexed record store, not an ordering source.
- Opening an already-open path activates the existing tab and never creates a
  duplicate.
- A preview tab is replaceable only while clean. A dirty preview is promoted
  before another preview replaces it.
- Pinning makes a tab non-preview. Unpinning does not discard the tab or its
  document state.

### Active tab

- `pane.activeTabId` is persisted and restored when the referenced tab still
  exists.
- Legacy snapshots without an active tab fall back deterministically to the
  last surviving tab in open order.
- Activating a different tab updates `lastAccessedAt` and bumps the workspace
  persistence version. Dirty-state changes do not bump it because editor
  documents and undo history are owned by the editor cache.

### Closing

- Closing an active tab selects the next tab to the right; if there is no
  right-hand tab, it selects the previous tab. Closing the only tab leaves the
  pane empty.
- Closing an inactive tab never changes the active tab.
- Dirty-tab close paths must preserve edits through the editor's flush/prune
  lifecycle. Any future confirmation UI must sit at the orchestration boundary
  and must not bypass the tab store's state invariants.

### Overflow

- The active tab must remain visible in the tab strip.
- When the strip cannot fit every tab, the visible range is a contiguous
  window containing the active tab. Hidden tabs remain available through the
  overflow menu.
- Drop indicators and chrome separators operate on the visible range, not on
  the assumption that visible tabs are always the first tabs.

### Keyboard access

- The tab strip uses a roving `tabIndex`: only the active tab is in the normal
  tab sequence.
- `ArrowLeft` and `ArrowRight` move cyclically through tabs.
- `Home` and `End` move to the first and last tab.
- Keyboard activation focuses the newly active tab after state updates.

### Persistence contract

Persisted tabs include `id`, `path`, `title`, `leafType`, pin/preview state,
dirty marker, and timestamps. Transient navigation data such as jump-to-line
and rename-on-open is never persisted. The active pane selection is persisted
separately from tab records.

Hydration filters pane ids that no longer have tab records and maps legacy
`viewType` snapshots to `leafType`, defaulting unknown legacy note tabs to
`markdown`.

## Consequences

- Restart returns the user to the note they were actually viewing.
- Closing a note has predictable local movement rather than jumping across the
  whole tab strip.
- Graph and future registered leaf types survive workspace restoration.
- Overflow remains usable for large tab sets without hiding the current note.
- Keyboard navigation behaves like a desktop tab list and does not require a
  mouse.
- Pane splits can later reuse these rules because ordering and active state are
  already pane-owned.

## Validation

The tab suite must cover duplicate prevention, preview promotion, stable ids
across moves, adjacent-tab close selection, active-tab persistence, legacy
snapshot hydration, overflow range selection, and keyboard navigation.
