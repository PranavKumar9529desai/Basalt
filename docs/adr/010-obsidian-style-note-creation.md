# ADR-010: Obsidian-Style Instant Note Creation

**Date:** 2026-04-05  
**Status:** Accepted  
**Superseded in part by:** [ADR-023](023-inline-title-rename.md) — the
"Further Work" section on the inline title shipped there.

## Context

The original "create new note" flow required the user to type a name in an inline ghost-node text input before the file was created on disk. This introduced unnecessary friction and was inconsistent with Obsidian's UX — the gold standard for desktop markdown workspaces.

## Decision

All three note creation entry points (Ctrl+N keyboard shortcut, sidebar "New note" button, context menu "New Note") now instantly create a file on disk without any name prompt:

- Name is auto-generated: `Untitled`, then `Untitled 1`, `Untitled 2`, … up to `Untitled 99`
- File is created in the same folder as the currently focused/selected tree node, or vault root if nothing is selected
- The file opens in the editor immediately after creation
- Deduplication is handled Rust-side via a new `create_untitled_note(parent?)` Tauri command that loops until it finds a free slot

The ghost-node inline input is **preserved for folder creation only** (`startFolderInline`) — naming a folder before creation is still the right UX there.

## Consequences

- Note creation is now a single action with no intermediate state
- The `create_note` command (named creation) remains available for programmatic use
- Renaming a note after creation is complete via the inline title — see [ADR-023](023-inline-title-rename.md)

## Inline Title (shipped — see ADR-023)

The "Further Work" item below (an editable title above the CodeMirror editor that renames the file, updates on external renames, and is the documented complement to this feature) shipped in ADR-023:

- The inline title is **not** a `# H1` in the markdown content — it is a UI element injected above the editor
- Editing the inline title renames the file on disk (rewriting `[[wikilinks]]` in other notes)
- Renaming the file elsewhere updates the inline title (it reads the live tab title through the tabs store)
- New files open with the inline title in edit mode with the whole name selected — this **overrides** this ADR's earlier "cursor in the editor body" plan, per the ADR-023 decision (one-shot `renameOnOpen`)
