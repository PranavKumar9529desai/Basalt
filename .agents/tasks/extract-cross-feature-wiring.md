# Task: Extract Cross-Feature Wiring to Shell

## Goal

Restructure `useVaultController` so vault doesn't call editor/tabs callbacks directly. Features emit results. Shell reacts.

---

## Problem

`useVaultController` calls `editor.loadNote()` and `editor.closeNote()` in 5 places:

| Line | Method | What it does |
|---|---|---|
| 301 | `createNoteInstant` | Creates note → calls `editor.loadNote()` |
| 379 | `handleCommitEdit` | Creates note from inline edit → calls `editor.loadNote()` |
| 396 | `handleConfirmDelete` | Deletes files → calls `editor.closeNote()` |
| 408 | `onMenuNewNote` | Context menu "New Note" → calls `editor.loadNote()` |
| 511 | `onTreeFileClick` | File click → calls `editor.loadNote()` or `onFileOpen()` |

Additionally, `tabs/commands.ts` imports `useFocusedPaneStore` from editor (cross-feature import violation).

---

## Architecture After

```
Features emit results, never call other features' methods:

  vault.createNoteInstant()     → returns { path, name } | null
  vault.handleCommitEdit()      → returns { path, name } | null
  vault.handleConfirmDelete()   → returns deleted paths[]
  vault.onTreeFileClick()       → returns { node, mode } event

Shell reacts to results:

  on vault.createNote    → tabs.openInPreview(path) + editor.loadNote(path)
  on vault.delete        → tabs.closeTab(path)
  on vault.fileClick     → tabs.open(path, mode)
```

---

## Step 1: Remove `editor` interface from `useVaultController`

### 1a: New `UseVaultControllerOptions`

Remove `editor: VaultNoteController` and `onFileOpen`. Vault no longer knows about editor or tabs.

```ts
export interface UseVaultControllerOptions {
  treeNodes: FlatTreeNode[];
  visibleNodes: FlatTreeNode[];
  vaultPath: string | null;
  /** Read-only: which note is selected in the editor. For delete targeting only. */
  selectedNote: { name: string; path: string } | null;
  mutations: UseVaultMutationsReturn;
  openFolder: (relPath: string) => void;
  toggleFolder: (relPath: string) => void;
  refreshTree: () => Promise<void>;
}
```

### 1b: Return values from operations instead of calling callbacks

**`createNoteInstant`** — currently returns `void`, calls `editor.loadNote()`:
```ts
// Before
const createNoteInstant = useCallback(async () => {
  const ctx = deriveParentContext();
  if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
  const result = await mutations.createUntitledNote(ctx.parentRelPath || undefined);
  if (!result) return;
  editor.loadNote({ name: result.name, path: result.path });  // ❌ cross-feature
  await refreshTree();
}, [/* deps */]);

// After
const createNoteInstant = useCallback(async (): Promise<CreateNoteResult | null> => {
  const ctx = deriveParentContext();
  if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
  const result = await mutations.createUntitledNote(ctx.parentRelPath || undefined);
  await refreshTree();
  return result;  // ✅ shell decides what to do with it
}, [/* deps */]);
```

**`handleCommitEdit`** — currently returns `void`, calls `editor.loadNote()`:
```ts
// Before
const handleCommitEdit = useCallback(async (node, newName) => {
  // ... create note ...
  if (result) editor.loadNote({ name: result.name, path: result.path });  // ❌
}, [/* deps */]);

// After
const handleCommitEdit = useCallback(async (node, newName): Promise<CreateNoteResult | null> => {
  // ... create note ...
  return result;  // ✅
}, [/* deps */]);
```

**`handleConfirmDelete`** — currently returns `void`, calls `editor.closeNote()`:
```ts
// Before
const handleConfirmDelete = useCallback(async () => {
  const deletesSelectedEditor = editor.selected !== null && mutations.pendingDeletePaths.includes(editor.selected.path);
  const deleted = await mutations.confirmDelete();
  if (deleted && deletesSelectedEditor) editor.closeNote();  // ❌
}, [/* deps */]);

// After
const handleConfirmDelete = useCallback(async (): Promise<string[]> => {
  const deletedPaths = [...mutations.pendingDeletePaths];
  const deleted = await mutations.confirmDelete();
  return deleted ? deletedPaths : [];  // ✅ shell closes tabs
}, [/* deps */]);
```

**`onMenuNewNote`** — currently calls `editor.loadNote()`:
```ts
// Before
const onMenuNewNote = useCallback(() => {
  // ... create note ...
  editor.loadNote({ name: result.name, path: result.path });  // ❌
}, [/* deps */]);

// After
const onMenuNewNote = useCallback(async () => {
  // ... create note ...
  return result;  // ✅ return via contextMenu callback or return value
}, [/* deps */]);
```

**`onTreeFileClick`** — currently calls `editor.loadNote()` or `onFileOpen()`:
```ts
// Before
const onTreeFileClick = useCallback((node, e) => {
  // ... selection ...
  if (onFileOpen) {
    onFileOpen(node, mode);  // ❌
  } else {
    editor.loadNote({ name: node.name, path: node.path });  // ❌
  }
}, [/* deps */]);

// After — emit event, shell reacts
const onTreeFileClick = useCallback((node, e) => {
  // ... selection ...
  onFileOpen?.(node, mode);  // ✅ always call shell callback
}, [/* deps */]);
```

### 1c: Use `selectedNote` prop instead of `editor.selected`

Replace `editor.selected` reads with the new `selectedNote` prop:
- Line 266: `treeNodes.find((n) => n.path === editor.selected?.path)` → `treeNodes.find((n) => n.path === selectedNote?.path)`
- Line 393-396: `editor.selected !== null && mutations.pendingDeletePaths.includes(editor.selected.path)` → `selectedNote !== null && mutations.pendingDeletePaths.includes(selectedNote.path)`
- Line 567-571: `editor.selected` → `selectedNote`

### 1d: Simplify `UseVaultControllerReturn`

Remove `createNoteInstant` void return → now returns `Promise<CreateNoteResult | null>`.
Remove `handleConfirmDelete` void return → now returns `Promise<string[]>`.
Remove `handleCommitEdit` void return → now returns `Promise<CreateNoteResult | null>`.

Keep `onTreeFileClick` as void — it calls `onFileOpen` which is now a simple callback prop.

### 1e: `onFileOpen` stays as callback prop (not removed)

`onFileOpen` is the shell's way of saying "when vault clicks a file, I'll handle opening it." This is proper shell wiring — vault doesn't know tabs exist, it just calls the callback.

```ts
// Still in options
onFileOpen?: (node: FlatTreeNode, mode: "preview" | "pinned") => void;
```

But `editor.loadNote` and `editor.closeNote` are removed.

---

## Step 2: Update `useWorkspaceSidebar`

The shell now handles the orchestration by reacting to vault operation results.

```ts
export function useWorkspaceSidebar({ vaultPath, treeNodes, ... }: Props) {
  const mutations = useVaultMutations();
  const { openInPreview, openPinned, setTabTitle, closeTab, focusedSessionTab, focusedSessionSelected } = editor;

  const tabClickOpenBehavior = useSetting("tabClickOpenBehavior");

  // Shell-owned: open file in tab
  const loadNote = useCallback((note: { path: string; name: string }) => {
    const tabId = openInPreview({ path: note.path, title: note.name });
    setTabTitle(tabId, note.name);
  }, [openInPreview, setTabTitle]);

  // Shell-owned: close file tab
  const closeNoteTab = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    const { groups } = useTabsStore.getState();
    for (const group of Object.values(groups)) {
      if (group.tabIds.includes(tab.id)) {
        closeTab(group.id, tab.id, { force: true });
        break;
      }
    }
  }, [focusedSessionTab, closeTab]);

  // Shell-owned: file open handler (click behavior)
  const onFileOpen = useCallback((node: FlatTreeNode, mode: "preview" | "pinned") => {
    const effectiveMode = tabClickOpenBehavior === "vscode" ? mode : tabClickOpenBehavior;
    const tabId = effectiveMode === "pinned"
      ? openPinned({ path: node.path, title: node.name })
      : openInPreview({ path: node.path, title: node.name });
    setTabTitle(tabId, node.name);
  }, [tabClickOpenBehavior, openPinned, openInPreview, setTabTitle]);

  // Vault controller — now takes selectedNote instead of editor interface
  const controller = useVaultController({
    treeNodes, visibleNodes, vaultPath, mutations,
    openFolder, toggleFolder, refreshTree,
    selectedNote: focusedSessionSelected,
    onFileOpen,
  });

  // Shell reacts to vault operations
  const wrappedCreateNoteInstant = useCallback(async () => {
    const result = await controller.createNoteInstant();
    if (result) loadNote(result);
  }, [controller.createNoteInstant, loadNote]);

  const wrappedHandleCommitEdit = useCallback(async (node, newName) => {
    const result = await controller.handleCommitEdit(node, newName);
    if (result) loadNote(result);
  }, [controller.handleCommitEdit, loadNote]);

  const wrappedHandleConfirmDelete = useCallback(async () => {
    const deletedPaths = await controller.handleConfirmDelete();
    // Close tabs for deleted files
    const state = useTabsStore.getState();
    for (const path of deletedPaths) {
      const tabId = tabIdFromPath(path);
      const groupId = findGroupForTab(state.groups, tabId);
      if (groupId) state.closeTab(groupId, tabId, { force: true });
    }
    // Close editor if the selected note was deleted
    if (deletedPaths.includes(focusedSessionSelected?.path ?? "")) {
      closeNoteTab();
    }
  }, [controller.handleConfirmDelete, focusedSessionSelected, closeNoteTab]);

  return {
    controller: {
      ...controller,
      createNoteInstant: wrappedCreateNoteInstant,
      handleCommitEdit: wrappedHandleCommitEdit,
      handleConfirmDelete: wrappedHandleConfirmDelete,
    },
    mutations,
    contextMenu: controller.contextMenu,
    selection: controller.selection,
  };
}
```

---

## Step 3: Move `tabs/commands.ts` to shell

The `tabs/commands.ts` file imports `useFocusedPaneStore` from editor — a cross-feature violation. Move command registration to the shell where both stores are accessible.

**Delete**: `apps/tauri/src/features/tabs/commands.ts`

**Create**: `apps/tauri/src/app-shell/hooks/useTabCommands.ts`

```ts
import { commandService } from "@workspace/commands";
import { useFocusedPaneStore } from "../features/editor";
import { findGroupForTab, getTabByPath, useTabsStore } from "../features/tabs";

export function registerTabCommands() {
  function resolveTabAndGroup() {
    const selected = useFocusedPaneStore.getState().focusedPaneSelected;
    if (!selected?.path) return null;
    const { tabs, groups } = useTabsStore.getState();
    const tab = getTabByPath(groups, tabs, selected.path);
    if (!tab) return null;
    const groupId = findGroupForTab(groups, tab.id);
    if (!groupId) return null;
    return { tab, groupId, groups };
  }

  commandService.registerCommand("tabs:close-active", () => {
    const resolved = resolveTabAndGroup();
    if (resolved) useTabsStore.getState().closeTab(resolved.groupId, resolved.tab.id, { force: true });
  }, () => resolveTabAndGroup() !== null);

  // ... same for all other tab commands
}
```

**Update**: `apps/tauri/src/app-shell/WorkspaceInit.tsx` or `WorkspaceView.tsx` to call `registerTabCommands()` at init.

---

## Step 4: Remove `handleConfirmDeleteWithTabs` from `useWorkspaceSidebar`

The current `handleConfirmDeleteWithTabs` duplicates the delete-then-close-tabs logic. With the new architecture, `wrappedHandleConfirmDelete` handles this. Remove the old method.

---

## Files to Modify

| File | Change |
|---|---|
| `features/vault/hooks/useVaultController.ts` | Remove `editor` interface, add `selectedNote` prop, return values from operations |
| `app-shell/hooks/useWorkspaceSidebar.ts` | Simplify — react to vault results, wrap operations |
| `features/tabs/commands.ts` | DELETE — move to shell |
| `app-shell/hooks/useTabCommands.ts` | NEW — register tab commands with cross-store access |
| `app-shell/WorkspaceView.tsx` | Import `useTabCommands`, pass `selectedNote` to sidebar |
| `app-shell/WorkspaceInit.tsx` | Call `registerTabCommands()` at init |

---

## What Gets Simpler

1. **`useVaultController`** — No longer imports/uses editor or tabs. Pure vault operations. Returns results.
2. **`useWorkspaceSidebar`** — Still the orchestrator, but now explicitly wraps vault results into tab/editor actions. Clear flow: vault does X → shell does Y.
3. **`tabs/commands.ts`** — No longer violates cross-feature import rule. Lives in shell where both stores are accessible.
4. **Vault feature** — Zero dependencies on editor or tabs. Could be tested in isolation.

---

## Verification

After each step:
```bash
bun run lint && bunx tsc --noEmit
```

Test manually:
- Cmd+N creates note and opens in editor
- Inline folder/note creation works
- Delete file closes tab + clears editor
- Click file in sidebar opens in tab (preview/pinned based on setting)
- Right-click → New Note works
- All tab commands still work (Cmd+W, split, pin)
- Conflict banner + discard works
