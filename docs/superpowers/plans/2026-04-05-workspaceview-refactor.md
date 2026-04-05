# WorkspaceView Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break `WorkspaceView.tsx` (~394 lines) into three focused units — a tab-handlers hook, a sidebar-state hook, and an overlays component — leaving the view as pure composition (~80 lines).

**Architecture:** Extract two custom hooks (`useWorkspaceTabHandlers`, `useWorkspaceSidebar`) and one presentational component (`WorkspaceOverlays`). Each lives in the `layout/` directory alongside existing files. No new feature folders.

**Tech Stack:** React, TypeScript, Zustand (`useTabsStore`), existing vault/tab hooks.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `apps/tauri/src/layout/useWorkspaceTabHandlers.ts` | All tab-interaction callbacks |
| Create | `apps/tauri/src/layout/useWorkspaceSidebar.ts` | Vault tree + file-tree controller state |
| Create | `apps/tauri/src/layout/WorkspaceOverlays.tsx` | Dialogs, context menus, modals |
| Modify | `apps/tauri/src/layout/WorkspaceView.tsx` | Composition only |

---

## Task 1: Extract `useWorkspaceTabHandlers`

**Files:**
- Create: `apps/tauri/src/layout/useWorkspaceTabHandlers.ts`
- Modify: `apps/tauri/src/layout/WorkspaceView.tsx`

### What it owns

All ten handlers that follow the pattern "find `focusedSessionTab` in groups → dispatch an action":
`handleTabSelect`, `handleTabClose`, `handleTabPinToggle`, `handleCloseActiveTab`, `handleCloseOtherTabs`, `handleCloseTabsToRight`, `handleTogglePinActiveTab`, `handleSplitRight`, `handleSplitLeft`, `handleSplitUp`, `handleSplitDown`.

- [ ] **Step 1: Create the hook file**

```ts
// apps/tauri/src/layout/useWorkspaceTabHandlers.ts
import { useCallback } from "react";
import type { TabGroupId, TabGroupModel, TabModel, SplitDirection } from "../features/tabs/types";

interface TabActions {
  groups: Record<TabGroupId, TabGroupModel>;
  activateTab: (groupId: TabGroupId, tabId: string) => void;
  closeTab: (groupId: TabGroupId, tabId: string, opts: { force: boolean }) => void;
  closeOtherTabs: (groupId: TabGroupId, tabId: string) => void;
  closeTabsToRight: (groupId: TabGroupId, tabId: string) => void;
  togglePinTab: (tabId: string) => void;
  splitGroupWithTab: (groupId: TabGroupId, direction: SplitDirection, tabId: string) => void;
  setFocusedGroup: (groupId: TabGroupId) => void;
}

interface Props {
  tabActions: TabActions;
  focusedSessionTab: TabModel | null;
}

export function useWorkspaceTabHandlers({ tabActions, focusedSessionTab }: Props) {
  const { groups, activateTab, closeTab, closeOtherTabs, closeTabsToRight, togglePinTab, splitGroupWithTab, setFocusedGroup } = tabActions;

  const findGroupForTab = useCallback(
    (tabId: string): TabGroupModel | undefined =>
      Object.values(groups).find((g) => g.tabIds.includes(tabId)),
    [groups],
  );

  const handleTabSelect = useCallback(
    (groupId: TabGroupId, tabId: string) => {
      setFocusedGroup(groupId);
      activateTab(groupId, tabId);
    },
    [activateTab, setFocusedGroup],
  );

  const handleTabClose = useCallback(
    (groupId: TabGroupId, tabId: string) => {
      closeTab(groupId, tabId, { force: true });
    },
    [closeTab],
  );

  const handleTabPinToggle = useCallback(
    (tabId: string) => {
      togglePinTab(tabId);
    },
    [togglePinTab],
  );

  const withActiveTab = useCallback(
    (fn: (groupId: TabGroupId, tabId: string) => void) => () => {
      if (!focusedSessionTab) return;
      const group = findGroupForTab(focusedSessionTab.id);
      if (group) fn(group.id, focusedSessionTab.id);
    },
    [focusedSessionTab, findGroupForTab],
  );

  const handleCloseActiveTab = useCallback(
    withActiveTab((groupId, tabId) => closeTab(groupId, tabId, { force: true })),
    [withActiveTab, closeTab],
  );

  const handleCloseOtherTabs = useCallback(
    withActiveTab((groupId, tabId) => closeOtherTabs(groupId, tabId)),
    [withActiveTab, closeOtherTabs],
  );

  const handleCloseTabsToRight = useCallback(
    withActiveTab((groupId, tabId) => closeTabsToRight(groupId, tabId)),
    [withActiveTab, closeTabsToRight],
  );

  const handleTogglePinActiveTab = useCallback(
    withActiveTab((_groupId, tabId) => togglePinTab(tabId)),
    [withActiveTab, togglePinTab],
  );

  const makeSplitHandler = (direction: SplitDirection) =>
    withActiveTab((groupId, tabId) => splitGroupWithTab(groupId, direction, tabId));

  const handleSplitRight = useCallback(makeSplitHandler("right"), [withActiveTab, splitGroupWithTab]);
  const handleSplitLeft = useCallback(makeSplitHandler("left"), [withActiveTab, splitGroupWithTab]);
  const handleSplitUp = useCallback(makeSplitHandler("top"), [withActiveTab, splitGroupWithTab]);
  const handleSplitDown = useCallback(makeSplitHandler("bottom"), [withActiveTab, splitGroupWithTab]);

  return {
    handleTabSelect,
    handleTabClose,
    handleTabPinToggle,
    handleCloseActiveTab,
    handleCloseOtherTabs,
    handleCloseTabsToRight,
    handleTogglePinActiveTab,
    handleSplitRight,
    handleSplitLeft,
    handleSplitUp,
    handleSplitDown,
  };
}
```

- [ ] **Step 2: Wire into WorkspaceView — replace the eleven handlers**

In `WorkspaceView.tsx`:

Remove these imports (they are now internal to the hook):
```ts
// remove individual useCallback calls for all eleven handlers listed above
```

Add the hook call after the `tabs` destructure:

```ts
const tabHandlers = useWorkspaceTabHandlers({
  tabActions: {
    groups: tabs.groups,
    activateTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    togglePinTab,
    splitGroupWithTab,
    setFocusedGroup,
  },
  focusedSessionTab,
});
```

Update JSX props to spread or dot-access from `tabHandlers`:
```tsx
<WorkspaceTabs
  handleTabSelect={tabHandlers.handleTabSelect}
  handleTabClose={tabHandlers.handleTabClose}
  handleTabPinToggle={tabHandlers.handleTabPinToggle}
  ...
/>
<AppCommands
  onCloseActiveTab={tabHandlers.handleCloseActiveTab}
  onCloseOtherTabs={tabHandlers.handleCloseOtherTabs}
  onCloseTabsToRight={tabHandlers.handleCloseTabsToRight}
  onTogglePinActiveTab={tabHandlers.handleTogglePinActiveTab}
  onSplitRight={tabHandlers.handleSplitRight}
  onSplitLeft={tabHandlers.handleSplitLeft}
  onSplitTop={tabHandlers.handleSplitUp}
  onSplitBottom={tabHandlers.handleSplitDown}
  ...
/>
```

- [ ] **Step 3: Lint + type-check**

```bash
fish -c "cd /Users/pranavkumar/projects/Basalt && bun run lint && bunx tsc --noEmit"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/tauri/src/layout/useWorkspaceTabHandlers.ts apps/tauri/src/layout/WorkspaceView.tsx
git commit -m "refactor(layout): extract useWorkspaceTabHandlers from WorkspaceView"
```

---

## Task 2: Extract `WorkspaceOverlays`

**Files:**
- Create: `apps/tauri/src/layout/WorkspaceOverlays.tsx`
- Modify: `apps/tauri/src/layout/WorkspaceView.tsx`

### What it owns

The five portal/modal/dialog elements at the bottom of the JSX tree:
`FileTreeContextMenu`, `ConfirmDialog`, `SearchModal`, `QuickSwitcher`, `SettingsModal`.

- [ ] **Step 1: Create the component**

```tsx
// apps/tauri/src/layout/WorkspaceOverlays.tsx
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { FileTreeContextMenu } from "@workspace/ui/components/file-tree";
import { QuickSwitcher, SearchModal } from "../features/search";
import { SettingsModal } from "../features/settings";

interface WorkspaceOverlaysProps {
  contextMenu: {
    isOpen: boolean;
    menuState: {
      anchor: Parameters<typeof FileTreeContextMenu>[0]["anchor"];
      target: { kind: "file" | "folder" } | null;
    };
    closeMenu: () => void;
  };
  mutations: {
    isDeleteConfirmOpen: boolean;
    setDeleteConfirmOpen: (open: boolean) => void;
    pendingDeletePaths: string[];
    pendingDeleteName: string;
    isLoading: boolean;
  };
  controller: {
    isMultiSelectContextMenu: boolean;
    canPasteToMenuTarget: boolean;
    onMenuNewNote: () => void;
    onMenuNewFolder: () => void;
    onMenuCut: () => void;
    onMenuPaste: () => void;
    onMenuDelete: () => void;
  };
  onConfirmDelete: () => void;
  onSearchOpen: (path: string) => void;
}

export function WorkspaceOverlays({
  contextMenu,
  mutations,
  controller,
  onConfirmDelete,
  onSearchOpen,
}: WorkspaceOverlaysProps) {
  return (
    <>
      <FileTreeContextMenu
        open={contextMenu.isOpen}
        anchor={contextMenu.menuState.anchor}
        targetKind={contextMenu.menuState.target?.kind ?? null}
        isMultiSelect={controller.isMultiSelectContextMenu}
        canPaste={controller.canPasteToMenuTarget}
        onOpenChange={(open) => {
          if (!open) contextMenu.closeMenu();
        }}
        onNewNote={controller.onMenuNewNote}
        onNewFolder={controller.onMenuNewFolder}
        onCut={controller.onMenuCut}
        onPaste={controller.onMenuPaste}
        onDelete={controller.onMenuDelete}
      />

      <ConfirmDialog
        open={mutations.isDeleteConfirmOpen}
        onOpenChange={mutations.setDeleteConfirmOpen}
        title={
          mutations.pendingDeletePaths.length > 1
            ? "Delete selected items"
            : "Delete note"
        }
        description={
          mutations.pendingDeletePaths.length > 1
            ? `Permanently delete ${mutations.pendingDeletePaths.length} selected items? This cannot be undone.`
            : `Permanently delete "${mutations.pendingDeleteName}"? This cannot be undone.`
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={onConfirmDelete}
        isLoading={mutations.isLoading}
      />

      <SearchModal onOpen={onSearchOpen} />
      <QuickSwitcher onOpen={onSearchOpen} />
      <SettingsModal />
    </>
  );
}
```

- [ ] **Step 2: Replace the five elements in WorkspaceView with the component**

Remove the `ConfirmDialog`, `FileTreeContextMenu`, `SearchModal`, `QuickSwitcher`, `SettingsModal` imports from `WorkspaceView.tsx`.

Add import:
```ts
import { WorkspaceOverlays } from "./WorkspaceOverlays";
```

Replace the five JSX nodes at the bottom of the return with:
```tsx
<WorkspaceOverlays
  contextMenu={contextMenu}
  mutations={mutations}
  controller={controller}
  onConfirmDelete={handleConfirmDeleteWithTabs}
  onSearchOpen={handleSearchOpen}
/>
```

- [ ] **Step 3: Lint + type-check**

```bash
fish -c "cd /Users/pranavkumar/projects/Basalt && bun run lint && bunx tsc --noEmit"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/tauri/src/layout/WorkspaceOverlays.tsx apps/tauri/src/layout/WorkspaceView.tsx
git commit -m "refactor(layout): extract WorkspaceOverlays from WorkspaceView"
```

---

## Task 3: Extract `useWorkspaceSidebar`

**Files:**
- Create: `apps/tauri/src/layout/useWorkspaceSidebar.ts`
- Modify: `apps/tauri/src/layout/WorkspaceView.tsx`

### What it owns

All vault/file-tree state: `useVaultMutations`, `useVaultSelection`, `useVaultClipboard`, `useVaultContextMenu`, `useVaultFileTreeController`, and the editor callbacks wired into the controller.

- [ ] **Step 1: Define the hook interface and create the file**

```ts
// apps/tauri/src/layout/useWorkspaceSidebar.ts
import { useCallback } from "react";
import { useTabsStore } from "../features/tabs/store";
import { useVaultClipboard } from "../features/vault/hooks/useVaultClipboard";
import { useVaultContextMenu } from "../features/vault/hooks/useVaultContextMenu";
import { useVaultFileTreeController } from "../features/vault/hooks/useVaultFileTreeController";
import { useVaultMutations } from "../features/vault/hooks/useVaultMutations";
import { useVaultSelection } from "../features/vault/hooks/useVaultSelection";
import type { TabGroupModel, TabModel, TabGroupId } from "../features/tabs/types";
import type { FlatTreeNode } from "../features/vault/types";

type TabClickOpenBehavior = "preview" | "pinned" | "vscode";

interface EditorInterface {
  focusedSessionSelected: { path: string; name?: string } | null;
  focusedSessionTab: TabModel | null;
  groups: Record<TabGroupId, TabGroupModel>;
  openInPreview: (opts: { path: string; title: string }) => string;
  openPinned: (opts: { path: string; title: string }) => string;
  setTabTitle: (tabId: string, title: string) => void;
  closeTab: (groupId: TabGroupId, tabId: string, opts: { force: boolean }) => void;
  tabClickOpenBehavior: TabClickOpenBehavior;
}

interface Props {
  vaultPath: string;
  treeNodes: FlatTreeNode[];
  visibleNodes: FlatTreeNode[];
  openFolder: (id: string) => void;
  toggleFolder: (id: string) => void;
  refreshTree: () => void;
  editor: EditorInterface;
}

export function useWorkspaceSidebar({
  vaultPath,
  treeNodes,
  visibleNodes,
  openFolder,
  toggleFolder,
  refreshTree,
  editor,
}: Props) {
  const mutations = useVaultMutations();
  const selection = useVaultSelection();
  const clipboard = useVaultClipboard();
  const contextMenu = useVaultContextMenu();

  const controller = useVaultFileTreeController({
    treeNodes,
    visibleNodes,
    vaultPath,
    editor: {
      selected: editor.focusedSessionSelected,
      loadNote: (note) => {
        const tabId = editor.openInPreview({ path: note.path, title: note.name });
        editor.setTabTitle(tabId, note.name);
      },
      closeNote: () => {
        const tab = editor.focusedSessionTab;
        if (!tab) return;
        for (const group of Object.values(editor.groups)) {
          if (group.tabIds.includes(tab.id)) {
            editor.closeTab(group.id, tab.id, { force: true });
            break;
          }
        }
      },
    },
    mutations,
    selection,
    clipboard,
    contextMenu,
    openFolder,
    toggleFolder,
    refreshTree,
    onFileOpen: (node, mode) => {
      const effectiveMode =
        editor.tabClickOpenBehavior === "vscode" ? mode : editor.tabClickOpenBehavior;
      const tabId =
        effectiveMode === "pinned"
          ? editor.openPinned({ path: node.path, title: node.name })
          : editor.openInPreview({ path: node.path, title: node.name });
      editor.setTabTitle(tabId, node.name);
    },
  });

  const handleConfirmDeleteWithTabs = useCallback(async () => {
    const deletedPaths = [...mutations.pendingDeletePaths];
    await controller.handleConfirmDelete();

    const state = useTabsStore.getState();
    for (const path of deletedPaths) {
      const tabId = `tab:${path}`;
      for (const group of Object.values(state.groups)) {
        if (group.tabIds.includes(tabId)) {
          state.closeTab(group.id, tabId, { force: true });
          break;
        }
      }
    }
  }, [controller, mutations.pendingDeletePaths]);

  return {
    controller,
    mutations,
    contextMenu,
    selection,
    clipboard,
    handleConfirmDeleteWithTabs,
  };
}
```

- [ ] **Step 2: Wire into WorkspaceView**

Remove these from `WorkspaceView.tsx`:
```ts
// remove: useVaultMutations, useVaultSelection, useVaultClipboard,
//         useVaultContextMenu, useVaultFileTreeController imports
// remove: mutations, selection, clipboard, contextMenu, controller declarations
// remove: handleConfirmDeleteWithTabs declaration
```

Add import:
```ts
import { useWorkspaceSidebar } from "./useWorkspaceSidebar";
```

Replace the removed declarations with:
```ts
const { controller, mutations, contextMenu, handleConfirmDeleteWithTabs } =
  useWorkspaceSidebar({
    vaultPath,
    treeNodes,
    visibleNodes,
    openFolder,
    toggleFolder,
    refreshTree,
    editor: {
      focusedSessionSelected,
      focusedSessionTab,
      groups: tabs.groups,
      openInPreview,
      openPinned,
      setTabTitle,
      closeTab,
      tabClickOpenBehavior,
    },
  });
```

Note: `selection` and `clipboard` are consumed inside `useVaultFileTreeController` (now inside the hook) so they no longer need to be destructured in WorkspaceView.

The `controller` is still passed to `<Sidebar>` and `<WorkspaceOverlays>` — those props stay as-is.

- [ ] **Step 3: Lint + type-check**

```bash
fish -c "cd /Users/pranavkumar/projects/Basalt && bun run lint && bunx tsc --noEmit"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/tauri/src/layout/useWorkspaceSidebar.ts apps/tauri/src/layout/WorkspaceView.tsx
git commit -m "refactor(layout): extract useWorkspaceSidebar from WorkspaceView"
```

---

## Self-Review

**Spec coverage:**
- ✅ `useWorkspaceTabHandlers` — Task 1
- ✅ `WorkspaceOverlays` — Task 2
- ✅ `useWorkspaceSidebar` — Task 3
- ✅ WorkspaceView slimmed to ~80 lines — result of all three tasks

**Placeholder scan:** No TBDs; every step contains full code.

**Type consistency:**
- `TabGroupId`, `TabGroupModel`, `TabModel`, `SplitDirection` — all imported from `../features/tabs/types` consistently across Task 1 and Task 3.
- `FlatTreeNode` — imported from `../features/vault/types` in Task 3.
- `useTabsStore` — imported from `../features/tabs/store` in Task 3 (same import as original WorkspaceView).
