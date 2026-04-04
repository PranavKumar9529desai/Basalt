# ADR-010: Obsidian-Style Instant Note Creation

**Date:** 2026-04-05  
**Status:** Accepted

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
- Renaming a note after creation is not yet fully addressed — see **Further Work** below

## Further Work

**Inline title (editor title bar):** The natural complement to this feature is an editable title rendered above the CodeMirror editor — showing the filename, updating the file on rename, and updating when the file is renamed elsewhere (e.g. from the tree). This is how Obsidian handles the "title = filename" relationship:

- The inline title is **not** a `# H1` in the markdown content — it is a UI element injected above the editor
- Editing the inline title renames the file on disk
- Renaming the file (tree, command palette) updates the inline title
- New files open with the cursor in the editor body; the inline title is immediately visible and editable

This feature should be the **next item after note creation** and will complete the creation → naming flow. Until it ships, the context menu "Rename" (currently disabled) remains the only rename path.
