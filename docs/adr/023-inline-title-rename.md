# ADR-023: Inline Note Title + Rename

**Status:** Accepted (2026-08-30)
**Date:** 2026-08-30
**Supersedes/extends:** ADR-010 (completes creation → naming flow), ADR-022 (supplements the frontmatter `title` property), ADR-019 (decoration pipeline), ADR-018 (leaf registry)

## Context

ADR-010 shipped instant note creation but left naming as a hole: a note is
created as `Untitled`, `Untitled 1`, … and the only way to rename it was a
(disabled) tree context-menu item. Obsidian's answer is the **inline title** —
a UI element above the editor showing the filename, editable in place, that
renames the file on commit and updates when the file is renamed elsewhere.

Three interacting requirements shaped the design:

1. **Rename must be a single, atomic, recorded action.** Obsidian rewrites
   `[[wikilinks]]` in *other* notes when you rename (its backup-misrename bug
   made this table-stakes). A rename is one user intent and must mutate the
   filesystem, the graph, the index, and the UI consistently.
2. **The title must never touch the typing hot path.** The editor's
   <16ms-typing model (ADR-020/ADR-019) requires a React-free CodeMirror
   pipeline. A React `state` change on every keystroke inside the title would
   be fine — but the title lives *above a 5k-line-document scroller*, which
   must stay virtualized.
3. **The filename is the single source of truth.** Documents can carry a
   frontmatter `title` property (ADR-022) for display/backlinks, but disk is
   authoritative. The inline title *is* the filename surface, not a cosmetic
   label.

## Decision

### The three filename surfaces

Basalt has exactly three "names" for a note, and this ADR pins their roles:

| Surface | Owner | Purpose | Authoritative? |
| ------- | ----- | ------- | -------------- |
| On-disk stem (`Note` from `Note.md`) | filesystem | identity, persistence | **Yes** |
| Inline title (scroller UI) | leaf chrome | rename UX, display | reflect ✓, edits → rename |
| Frontmatter `title` property | document (ADR-022) | prose display, backlink labels | No — cosmetic, can differ |

Renaming flows **downhill**: the inline title edits the on-disk stem; the
frontmatter `title` is left untouched by rename. Backlink labels keep using
frontmatter `title` when present (ADR-022), falling back to the stem.

### Scroller-injected React title (not a block widget, not page-scroll)

The title is a React component mounted via `createRoot` into a slot element
injected as the **first child of `.cm-scroller`** (before `.cm-content`), so
it scrolls with the document. The editor gains a `data-basalt-title`
attribute that flips the scroller from its default flex-**row** to flex-
**column**, stacking the title above the content at full width. Selection and
cursor layers are absolutely positioned and direction-agnostic, so CM6 stays
the sole scroll owner with virtualization and the controller's `scrollDOM`
logic untouched. The `packages/editor` helper `attachScrollHeader(view, slot)`
owns insertion/cleanup + the layout flag; the leaf owns the React root's
lifecycle and re-renders it per tab (`key={tab.id}`).

Rejected alternatives, and why:

- **Block-widget title** (first candidate). The block-widget kernel (ADR-019)
  only ever emits `Decoration.replace` — there is no widget type at all, and a
  zero-width `Decoration.widget` at offset 0 has no syntax node to drive it
  (the title is external tab state, not doc-derived). Wiring one would require
  a new StateField + effect loop against the "one decoration pass per
  transaction" invariant. The frontmatter block widget renders imperative DOM,
  not React. Wrong shape.
- **Plain React + page-scroll** (second candidate). Rendering the title in a
  normal React flow would move scrolling from CM's `.cm-scroller` up to an
  outer container, losing CM's virtualized-dom rendering (whole documents
  emitted into the DOM) — a direct violation of the 25k-note goal.
- **Content-prefixed `# heading`**. The implicit-h1 approach pollutes the
  document and breaks the "title ∉ markdown content" rule Obsidian itself
  follows (ADR-010).

### One-shot parse-free "rename on open"

Instant-created notes open with the title in edit mode and the whole name
selected (overriding ADR-010's "cursor in the editor body"). The trigger is a
**transient `renameOnOpen` flag** on `OpenableTabInput`/`TabModel`,
mirroring the existing transient `line` flag:

- Set by `createNoteInstant` on the `loadNote` payload.
- Carried onto the TabModel at creation (and re-applied when an existing tab
  is re-targeted with the flag).
- **Excised from serialization**: the persistence layer now writes an
  explicit field list instead of `{ ...tab }` — this also fixes `line`
  leaking to disk. `leafType` remains serialized (graph tabs must survive
  restart).
- Consumed once: the leaf keeps a per-tab-id set of auto-edited titles, so
  switching away and back never re-enters rename mode, and a restart's
  rehydration can never resurrect the flag.

### Title interactions

Display mode shows the note's live title (read through `getTabInfo`, so a
rename elsewhere updates it immediately). Clicking swaps to an edit input
with the name selected. **Enter** commits, **Esc** cancels, **blur** commits
if the name changed (Obsidian semantics). An interrupted edit is committed
fire-and-forget on unmount so tab switches never silently drop a rename.
Backend errors (e.g. "a note named 'X' already exists") render inline and keep
the input in edit mode with the name re-selected. Commit is idempotent and
guarded against Enter-then-blur double-fires.

### Rename contract (backend)

`rename_note(path, newName)` in the Tauri crate is the single rename
endpoint, executed **entirely in Rust** (ADR-007: filesystem + graph + index
mutations belong there):

1. Sanitize `newName` (strip trailing `.md`/`.markdown`, reject empty/invalid
   or path-containing names).
2. Enumerate candidate notes whose wikilinks may reference the target, from
   `graph.metadata_cache` using `NoteRename::matches` (the same normalization
   the graph resolver uses: trim/lowercase/`.md`-strip, bare-name or
   path-suffixed match). Register self-writes for the renamed note and every
   candidate.
3. `std::fs::rename`, then read + rewrite each candidate's `[[wikilinks]]`
   (path prefixes preserved), writing back only files that changed.
   Self-links inside the renamed note are rewritten too.
4. Under the vault write lock: drop the old document and re-add the renamed
   note + changed candidates; `index_remove(old)` + `index_upsert` the
   rewritten set.
5. Returns `{ path, name, updated_files }` — only *changed* paths. **Emits
   no update event**: the frontend refreshes its own tree.

Frontend orchestration (`renameNote` in `shared/useWorkspace.ts`): invoke →
`refreshTree()` → `updateTabPaths([{ from, to }])`, which repoints the tab's
path/title **in place (id stable)**, preserving leaf editor caches, undo
history, and dirty state — the same mechanism moves use (tab ids are stable
by design). Watcher self-write suppression (already in Rust) guarantees the
rename's own disk writes never surface as conflicts.

## Consequences

- Note creation → naming is now one continuous recorded flow: create, select-
  all, type, Enter; wikilinks everywhere follow.
- The typing hot path is untouched: title edits live in a separate React root
  and the scroller remains CM's. No per-keystroke React renders, no
  virtualization changes, no controller changes.
- Renaming is atomic in Rust: filesystem, graph, and index can never
  disagree, and the single invoke keeps IPC cheap (ADR-020 batched-IPC
  direction).
- The `line` transient leak is fixed as a side effect of strict serialization.
- Known non-goals (future work): tree/context-menu rename entry, F2 binding,
  and the title's ⋮ overflow menu are still deferred. Frontmatter `title` is
  intentionally not renamed by this feature.

## Further Work

- Tree context-menu "Rename" (currently disabled) and command-palette rename
  should invoke the same `renameNote` orchestration.
- File watcher parity: rename a note outside the title should update the
  open tab's inline title live (already true — the title reads through
  `getTabInfo`).