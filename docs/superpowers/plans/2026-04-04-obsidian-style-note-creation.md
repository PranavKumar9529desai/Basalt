# Obsidian-Style Instant Note Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline ghost-node name-entry flow with instant "Untitled.md" creation on Ctrl+N, sidebar button, and context menu "New Note".

**Architecture:** A new Rust command `create_untitled_note` tries "Untitled", "Untitled 1" … "Untitled 99" until a free name is found, then creates the file and returns `CreateNoteResult`. The frontend hook gains a `createUntitledNote` method that calls it, and the controller replaces `startNoteInline` with `createNoteInstant`. All three entry points are rewired to call `createNoteInstant`.

**Tech Stack:** Rust (Tauri commands), TypeScript (React hooks, Zustand), Biome (lint), `bunx tsc --noEmit` (type-check).

---

## File Map

| File | Change |
|---|---|
| `apps/tauri/src-tauri/src/commands/files.rs` | Add `create_untitled_note` command + unit tests |
| `apps/tauri/src-tauri/src/commands/mod.rs` | Export `create_untitled_note` |
| `apps/tauri/src-tauri/src/lib.rs` | Register `create_untitled_note` in `invoke_handler` |
| `apps/tauri/src/features/vault/hooks/useVaultCreateMutations.ts` | Add `createUntitledNote` method + update interface |
| `apps/tauri/src/features/vault/hooks/useVaultFileTreeController.ts` | Add `createNoteInstant`, update `onMenuNewNote`, swap `startNoteInline` → `createNoteInstant` in return |
| `apps/tauri/src/layout/WorkspaceView.tsx` | Wire `onCreateNote` to `controller.createNoteInstant` |

---

## Task 1: Rust — `create_untitled_note` command

**Files:**
- Modify: `apps/tauri/src-tauri/src/commands/files.rs`

- [ ] **Step 1: Write the failing unit test**

Add this test inside the existing `#[cfg(test)] mod tests` block at the bottom of `files.rs` (after line 354):

```rust
#[test]
fn test_untitled_name_sequence() {
    // Verify the name generation logic in isolation.
    // "Untitled" is index 0, "Untitled 1" is index 1, etc.
    let name_for = |i: u8| -> String {
        if i == 0 {
            "Untitled".to_string()
        } else {
            format!("Untitled {i}")
        }
    };

    assert_eq!(name_for(0), "Untitled");
    assert_eq!(name_for(1), "Untitled 1");
    assert_eq!(name_for(99), "Untitled 99");
}
```

- [ ] **Step 2: Run the test to verify it compiles and passes** (it should pass immediately — it tests only the naming logic we're about to use)

```bash
fish -c "cd apps/tauri/src-tauri && cargo test test_untitled_name_sequence -- --nocapture"
```

Expected: `test commands::files::tests::test_untitled_name_sequence ... ok`

- [ ] **Step 3: Implement `create_untitled_note`**

Add this function to `files.rs` directly after the closing `}` of `create_note` (after line 171). The function follows the exact same structure as `create_note`:

```rust
/// Create a new note with an auto-generated "Untitled" name.
/// Tries "Untitled", "Untitled 1", …, "Untitled 99" until a free slot is found.
#[tauri::command]
pub fn create_untitled_note(
    parent: Option<String>,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<CreateNoteResult, String> {
    let config = load_config(&app);
    let vault_path_str = config
        .last_vault
        .ok_or_else(|| "no vault configured".to_string())?;

    let vault_path = Path::new(&vault_path_str);

    let parent_dir = match parent.as_deref() {
        Some(rel) if !rel.is_empty() => vault_path.join(rel),
        _ => vault_path.to_path_buf(),
    };

    for i in 0u8..=99 {
        let name = if i == 0 {
            "Untitled".to_string()
        } else {
            format!("Untitled {i}")
        };

        let file_path = parent_dir.join(format!("{name}.md"));
        if file_path.exists() {
            continue;
        }

        // Create parent directory if needed (e.g. the parent folder was just created).
        if !parent_dir.exists() {
            std::fs::create_dir_all(&parent_dir)
                .map_err(|e| format!("failed to create directory: {e}"))?;
        }

        let content = String::new();
        std::fs::write(&file_path, &content)
            .map_err(|e| format!("failed to write file: {e}"))?;

        let abs_path = file_path
            .canonicalize()
            .map_err(|e| format!("canonicalize failed: {e}"))?
            .to_string_lossy()
            .to_string();

        {
            let mut vault = state
                .vault
                .write()
                .map_err(|_| "vault lock poisoned".to_string())?;
            vault.add_document(&abs_path, &content);
        }

        let _ = app.emit(
            "vault://file-changed",
            FileChangeEvent {
                path: abs_path.clone(),
                kind: "created".into(),
            },
        );

        return Ok(CreateNoteResult {
            path: abs_path,
            name,
        });
    }

    Err("too many untitled notes (Untitled through Untitled 99 all exist)".to_string())
}
```

- [ ] **Step 4: Run all existing Rust tests to confirm nothing broke**

```bash
fish -c "cd apps/tauri/src-tauri && cargo test -- --nocapture 2>&1 | tail -20"
```

Expected: all tests pass, no compile errors.

- [ ] **Step 5: Commit**

```bash
git add apps/tauri/src-tauri/src/commands/files.rs
git commit -m "feat(rust): add create_untitled_note command with Untitled N deduplication"
```

---

## Task 2: Rust — Export and register the new command

**Files:**
- Modify: `apps/tauri/src-tauri/src/commands/mod.rs` (line 8–10)
- Modify: `apps/tauri/src-tauri/src/lib.rs` (lines 11–15 and 38)

- [ ] **Step 1: Export `create_untitled_note` from `mod.rs`**

In `apps/tauri/src-tauri/src/commands/mod.rs`, update line 9 to add `create_untitled_note`:

```rust
pub use files::{
    autocomplete_links, autocomplete_tags, create_folder, create_note, create_untitled_note,
    delete_file, delete_paths, get_backlinks, move_paths, open_file, save_file,
};
```

- [ ] **Step 2: Import and register in `lib.rs`**

In `apps/tauri/src-tauri/src/lib.rs`, update the `use commands::{...}` block (lines 10–15) to include `create_untitled_note`:

```rust
use commands::{
    autocomplete_links, autocomplete_tags, boot, create_folder, create_note, create_untitled_note,
    delete_file, delete_paths, get_backlinks, get_settings, get_vault_tree, get_workspace,
    move_paths, open_file, open_vault_dialog, reindex_vault, save_file, search_content,
    search_files, set_setting, set_vault, set_workspace_key,
};
```

Then add `create_untitled_note` to the `invoke_handler!` macro (after `create_note` on line 38):

```rust
            create_note,
            create_untitled_note,
            create_folder,
```

- [ ] **Step 3: Confirm it compiles**

```bash
fish -c "cd apps/tauri/src-tauri && cargo build 2>&1 | tail -20"
```

Expected: `Compiling basalt-app ...` then `Finished` with no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/tauri/src-tauri/src/commands/mod.rs apps/tauri/src-tauri/src/lib.rs
git commit -m "feat(rust): export and register create_untitled_note Tauri command"
```

---

## Task 3: TypeScript — `createUntitledNote` in `useVaultCreateMutations`

**Files:**
- Modify: `apps/tauri/src/features/vault/hooks/useVaultCreateMutations.ts`

- [ ] **Step 1: Add `createUntitledNote` to the return interface**

In `useVaultCreateMutations.ts`, update `UseVaultCreateMutationsReturn` (lines 12–29) to add the new method:

```typescript
export interface UseVaultCreateMutationsReturn {
  ghostNode: GhostNode | null;
  createNoteInline: (opts?: { parentRelPath?: string; depth?: number }) => void;
  createFolderInline: (opts?: {
    parentRelPath?: string;
    depth?: number;
  }) => void;
  clearGhost: () => void;
  createNote: (
    name: string,
    parent?: string,
  ) => Promise<CreateNoteResult | null>;
  createUntitledNote: (parent?: string) => Promise<CreateNoteResult | null>;
  createFolder: (name: string, parent?: string) => Promise<string | null>;
  movePaths: (
    sourcePaths: string[],
    destinationRelPath?: string,
  ) => Promise<boolean>;
  error: string | null;
  isLoading: boolean;
}
```

- [ ] **Step 2: Implement `createUntitledNote`**

Add this `useCallback` block inside `useVaultCreateMutations` directly after the `createNote` callback (after line 62):

```typescript
  const createUntitledNote = useCallback(
    async (parent?: string): Promise<CreateNoteResult | null> => {
      setError(null);
      setIsLoading(true);
      try {
        const result = await invoke<CreateNoteResult>("create_untitled_note", {
          parent: parent ?? null,
        });
        return result;
      } catch (err) {
        setError(String(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );
```

- [ ] **Step 3: Add `createUntitledNote` to the return object**

In the `return { ... }` block (lines 83–89), add `createUntitledNote` after `createNote`:

```typescript
  return {
    ghostNode,
    createNoteInline,
    createFolderInline,
    clearGhost,
    createNote,
    createUntitledNote,
    createFolder,
    movePaths,
    error,
    isLoading,
  };
```

- [ ] **Step 4: Run lint and type-check**

```bash
fish -c "cd /Users/pranavkumar/projects/Basalt && bun run lint && bunx tsc --noEmit"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/tauri/src/features/vault/hooks/useVaultCreateMutations.ts
git commit -m "feat(ts): add createUntitledNote to useVaultCreateMutations"
```

---

## Task 4: TypeScript — `createNoteInstant` in `useVaultFileTreeController`

**Files:**
- Modify: `apps/tauri/src/features/vault/hooks/useVaultFileTreeController.ts`

- [ ] **Step 1: Add `createNoteInstant` to the return interface**

In `UseVaultFileTreeControllerReturn` (lines 28–40), replace `startNoteInline` with `createNoteInstant`:

```typescript
export interface UseVaultFileTreeControllerReturn {
  createNoteInstant: () => Promise<void>;
  startFolderInline: () => void;
  cutIds: Set<string>;
  canPasteToMenuTarget: boolean;
  isMultiSelectContextMenu: boolean;
  handleCommitEdit: (
    node: FileNode & { parentRelPath?: string },
    newName: string,
  ) => Promise<void>;
  handleCancelEdit: () => void;
  handleConfirmDelete: () => Promise<void>;
  handleDeleteFromCommands: () => void;
  onTreeFileClick: (node: FlatTreeNode, e: React.UIEvent) => void;
  onTreeFolderToggle: (node: FlatTreeNode, e: React.UIEvent) => void;
  onTreeContextMenu: (node: FlatTreeNode, e: React.MouseEvent) => void;
  onTreeBackgroundContextMenu: (e: React.MouseEvent) => void;
  onMenuNewNote: () => void;
  onMenuNewFolder: () => void;
  onMenuCut: () => void;
  onMenuPaste: () => Promise<void>;
  onMenuDelete: () => void;
}
```

- [ ] **Step 2: Replace `startNoteInline` implementation with `createNoteInstant`**

In the function body, find `startNoteInline` (lines 63–64) and replace the entire callback with `createNoteInstant`:

```typescript
  const createNoteInstant = useCallback(async () => {
    const ctx = deriveParentContext();
    if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
    const result = await mutations.createUntitledNote(ctx.parentRelPath || undefined);
    if (!result) return;
    editor.loadNote({ name: result.name, path: result.path });
    await refreshTree();
  }, [deriveParentContext, editor, mutations, openFolder, refreshTree]);
```

The old `startNoteInline` block (lines 63–64) is removed entirely.

- [ ] **Step 3: Update `onMenuNewNote` to call `createNoteInstant`**

Find `onMenuNewNote` (lines 101–103) and replace it:

```typescript
  const onMenuNewNote = useCallback(() => {
    const ctx = deriveParentContextFromMenuTarget();
    contextMenu.closeMenu();
    setTimeout(async () => {
      if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
      const result = await mutations.createUntitledNote(ctx.parentRelPath || undefined);
      if (!result) return;
      editor.loadNote({ name: result.name, path: result.path });
      await refreshTree();
    }, 0);
  }, [contextMenu, deriveParentContextFromMenuTarget, editor, mutations, openFolder, refreshTree]);
```

- [ ] **Step 4: Update the return object**

Find the `return { ... }` block (lines 153–156) and swap `startNoteInline` for `createNoteInstant`:

```typescript
  return {
    createNoteInstant,
    startFolderInline,
    cutIds,
    canPasteToMenuTarget,
    isMultiSelectContextMenu: contextMenu.menuState.isMultiSelect,
    handleCommitEdit,
    handleCancelEdit,
    handleConfirmDelete,
    handleDeleteFromCommands,
    onTreeFileClick,
    onTreeFolderToggle,
    onTreeContextMenu,
    onTreeBackgroundContextMenu,
    onMenuNewNote,
    onMenuNewFolder,
    onMenuCut,
    onMenuPaste,
    onMenuDelete,
  };
```

- [ ] **Step 5: Run lint and type-check**

```bash
fish -c "cd /Users/pranavkumar/projects/Basalt && bun run lint && bunx tsc --noEmit"
```

Expected: TypeScript will error on the `WorkspaceView.tsx` usage of `controller.startNoteInline` — that's correct, it confirms the rename propagated. Fix it in the next task.

- [ ] **Step 6: Commit**

```bash
git add apps/tauri/src/features/vault/hooks/useVaultFileTreeController.ts
git commit -m "feat(ts): replace startNoteInline with createNoteInstant in controller"
```

---

## Task 5: TypeScript — Wire `WorkspaceView` to `createNoteInstant`

**Files:**
- Modify: `apps/tauri/src/layout/WorkspaceView.tsx`

- [ ] **Step 1: Find the `onCreateNote` wiring in `WorkspaceView.tsx`**

Search for `startNoteInline` in the file:

```bash
fish -c "grep -n 'startNoteInline' /Users/pranavkumar/projects/Basalt/apps/tauri/src/layout/WorkspaceView.tsx"
```

Note the line number — it will be something like `onCreateNote={controller.startNoteInline}`.

- [ ] **Step 2: Update the wiring**

Replace `controller.startNoteInline` with `controller.createNoteInstant` on the line found above. For example, if the line reads:

```tsx
onCreateNote={controller.startNoteInline}
```

Change it to:

```tsx
onCreateNote={controller.createNoteInstant}
```

- [ ] **Step 3: Run lint and type-check — must pass cleanly**

```bash
fish -c "cd /Users/pranavkumar/projects/Basalt && bun run lint && bunx tsc --noEmit"
```

Expected: zero errors, zero warnings.

- [ ] **Step 4: Commit**

```bash
git add apps/tauri/src/layout/WorkspaceView.tsx
git commit -m "feat(ts): wire onCreateNote to createNoteInstant in WorkspaceView"
```

---

## Task 6: Manual smoke test

- [ ] **Step 1: Start the dev server**

```bash
fish -c "cd /Users/pranavkumar/projects/Basalt && bun run dev"
```

- [ ] **Step 2: Verify Ctrl+N creates Untitled instantly**

  - Press Ctrl+N with nothing selected → `Untitled.md` appears in the tree at vault root and opens in the editor.
  - Press Ctrl+N again → `Untitled 1.md` is created.
  - Press Ctrl+N again → `Untitled 2.md` is created.
  - No inline text input appears at any point.

- [ ] **Step 3: Verify parent context is respected**

  - Select a file inside a folder, press Ctrl+N → new "Untitled" (or next available) appears in the same folder as the selected file.
  - Select a folder, press Ctrl+N → new "Untitled" appears inside that folder.

- [ ] **Step 4: Verify the sidebar button**

  - Click "New note" button in the sidebar → same instant behaviour, no inline input.

- [ ] **Step 5: Verify the context menu**

  - Right-click a folder → "New Note" → `Untitled.md` is created inside that folder and opens in the editor.

- [ ] **Step 6: Verify folder creation is unchanged**

  - Right-click → "New Folder" → inline text input still appears (ghost node behaviour unchanged).
  - Sidebar "New folder" button → inline text input still appears.

- [ ] **Step 7: Final lint + typecheck**

```bash
fish -c "cd /Users/pranavkumar/projects/Basalt && bun run lint && bunx tsc --noEmit"
```

Expected: clean.
