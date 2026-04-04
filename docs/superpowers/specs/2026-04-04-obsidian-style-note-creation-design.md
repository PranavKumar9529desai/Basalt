# Obsidian-Style Instant Note Creation

**Date:** 2026-04-04
**Status:** Approved

## Problem

The current "create new note" flow requires the user to type a name in an inline input before the file is created on disk. This is friction-heavy and inconsistent with how Obsidian works — the gold standard for desktop markdown workspaces.

## Goal

All three note creation entry points (keyboard shortcut Ctrl+N, sidebar "New note" button, context menu "New Note") instantly create an `Untitled.md` file and open it in the editor. No name prompt, no ghost node, no inline input for note creation.

## Behavior

- **Trigger:** Ctrl+N, sidebar button, or context menu "New Note"
- **Parent resolution:** Same folder as the currently focused/selected tree node. If nothing is selected, vault root.
- **Name resolution:** Try `Untitled`, then `Untitled 1`, `Untitled 2`, … up to `Untitled 99`. First name whose `.md` path does not exist on disk wins.
- **After creation:** File opens in the editor immediately. Parent folder opens in the tree if nested.
- **Error case:** If all 100 slots are taken, Rust returns an error; frontend surfaces it via the existing error handling pattern in `useVaultCreateMutations`.

## Out of Scope

- Rename via editor title bar (future task)
- Inline rename in file tree (future task)
- Context menu "Rename" remains disabled

## Architecture

### Rust (`crates/basalt-vault` or `apps/tauri/src-tauri/src/commands/files.rs`)

New command: `create_untitled_note(parent: Option<String>) -> Result<CreateNoteResult>`

1. Resolve parent directory: vault root if `None`, else vault root + parent
2. Loop `i` from `0..=99`:
   - Name = if `i == 0` then `"Untitled"` else `"Untitled {i}"`
   - Path = parent_dir + `{name}.md`
   - If path does not exist → create file, index it, emit `vault://file-changed { kind: "created" }`, return `CreateNoteResult { path, name }`
3. If loop exhausts → return `Err("too many untitled notes")`

The existing `create_note(name, parent)` command is unchanged.

### Frontend — `useVaultCreateMutations`

Add `createUntitledNote(parentRelPath?: string) => Promise<CreateNoteResult | null>`:
- Calls `invoke("create_untitled_note", { parent: parentRelPath ?? null })`
- Returns result or sets `error` state and returns `null` on failure

No changes to ghost node state or `createNoteInline`.

### Frontend — `useVaultFileTreeController`

Replace `startNoteInline` with `createNoteInstant`:

```
async createNoteInstant() {
  const { parentRelPath } = deriveParentContext()          // unchanged logic
  if (parentRelPath) openFolder(parentRelPath)
  const result = await mutations.createUntitledNote(parentRelPath || undefined)
  if (!result) return
  editor.loadNote(result)
  await refreshTree()
}
```

`startNoteInline` is removed. `startFolderInline` is untouched.

### Frontend — Wiring (`WorkspaceView`, `Sidebar`, `AppCommands`)

`onCreateNote` callback now points to `controller.createNoteInstant` instead of `controller.startNoteInline`. Prop names and component signatures are unchanged.

Context menu `onMenuNewNote` switches from `startNoteInline` to `createNoteInstant` with same parent-derivation logic.

## Files Touched

| File | Change |
|---|---|
| `apps/tauri/src-tauri/src/commands/files.rs` | Add `create_untitled_note` command |
| `apps/tauri/src/features/vault/hooks/useVaultCreateMutations.ts` | Add `createUntitledNote` method |
| `apps/tauri/src/features/vault/hooks/useVaultFileTreeController.ts` | Replace `startNoteInline` with `createNoteInstant`, update `onMenuNewNote` |
| `apps/tauri/src/layout/WorkspaceView.tsx` | Wire `onCreateNote` to `createNoteInstant` |

## Files Untouched

- `packages/ui/src/components/file-tree/FileTreeNode.tsx` — `InlineEditInput` stays for folder creation
- `packages/ui/src/components/file-tree/FileTree.tsx` — no change
- `apps/tauri/src/layout/Sidebar.tsx` — prop name unchanged
- `apps/tauri/src/layout/commands.tsx` — command ID and hotkey unchanged

> Note: `useVaultCreateMutations.ts` is in the touched list above (to add `createUntitledNote`), but ghost node state and `createFolderInline` within it are untouched.
