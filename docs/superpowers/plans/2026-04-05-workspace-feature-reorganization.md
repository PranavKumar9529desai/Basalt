# Workspace Feature Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move workspace orchestration files into `features/workspace/` following the same `components/` + `hooks/` + `index.ts` pattern every other feature uses, and slim `layout/` down to chrome components + a single `index.tsx` entry point.

**Architecture:** Three tasks: (1) patch the three existing feature index files that are missing exports WorkspaceView needs, (2) move the five workspace files into `features/workspace/` with updated imports, (3) wire up `features/workspace/index.ts`, `layout/index.tsx`, and update `routes/index.tsx`. No behavior changes anywhere — pure file reorganization.

**Tech Stack:** TypeScript, React, Biome (linter). Verification: `fish -c "cd /Users/pranavkumar/projects/Basalt && bun run lint 2>&1" | grep -v "SettingsModal\|inline-marks"` (3 pre-existing errors in unrelated files are expected) and `fish -c "cd /Users/pranavkumar/projects/Basalt/apps/tauri && bunx tsc --noEmit"`.

---

## File Map

### Files created
| Path | Purpose |
|---|---|
| `apps/tauri/src/features/workspace/components/WorkspaceView.tsx` | Moved from `layout/` |
| `apps/tauri/src/features/workspace/components/WorkspaceOverlays.tsx` | Moved from `layout/` |
| `apps/tauri/src/features/workspace/components/commands.tsx` | Moved from `layout/` |
| `apps/tauri/src/features/workspace/hooks/useWorkspaceTabHandlers.ts` | Moved from `layout/` |
| `apps/tauri/src/features/workspace/hooks/useWorkspaceSidebar.ts` | Moved from `layout/` |
| `apps/tauri/src/features/workspace/index.ts` | Public API: exports `WorkspaceView` |
| `apps/tauri/src/layout/index.tsx` | Entry point: re-exports `WorkspaceView` from workspace feature |

### Files modified
| Path | Change |
|---|---|
| `apps/tauri/src/features/editor/index.ts` | Add `usePaneManager` export |
| `apps/tauri/src/features/tabs/index.ts` | Add `WorkspaceTabs` + `TabClickOpenBehavior` exports |
| `apps/tauri/src/features/vault/index.ts` | Add `useVaultSelection` export |
| `apps/tauri/src/routes/index.tsx` | Update import path: `../layout/WorkspaceView` → `../layout` |

### Files deleted
| Path | Reason |
|---|---|
| `apps/tauri/src/layout/WorkspaceView.tsx` | Moved to `features/workspace/components/` |
| `apps/tauri/src/layout/WorkspaceOverlays.tsx` | Moved to `features/workspace/components/` |
| `apps/tauri/src/layout/commands.tsx` | Moved to `features/workspace/components/` |
| `apps/tauri/src/layout/useWorkspaceTabHandlers.ts` | Moved to `features/workspace/hooks/` |
| `apps/tauri/src/layout/useWorkspaceSidebar.ts` | Moved to `features/workspace/hooks/` |

---

## Task 1: Patch existing feature index files

**Files:**
- Modify: `apps/tauri/src/features/editor/index.ts`
- Modify: `apps/tauri/src/features/tabs/index.ts`
- Modify: `apps/tauri/src/features/vault/index.ts`

Three exports are missing from existing feature index files that `WorkspaceView` consumes:
- `usePaneManager` is not exported from `editor/index.ts`
- `WorkspaceTabs` and `TabClickOpenBehavior` are not exported from `tabs/index.ts`
- `useVaultSelection` is not exported from `vault/index.ts`

- [ ] **Step 1: Add `usePaneManager` to `editor/index.ts`**

Replace the full contents of `apps/tauri/src/features/editor/index.ts` with:

```ts
export { Editor } from "./components/editor-context-menu";
export { EditorCommandPalette } from "./components/command-palette";
export { useEditorSessionsStore } from "./store";
export type { EditorPaneId, EditorSessionSnapshot } from "./types";
export { useEditor } from "./hooks/useEditor";
export { usePaneManager } from "./PaneInstance";
```

- [ ] **Step 2: Add `WorkspaceTabs` and `TabClickOpenBehavior` to `tabs/index.ts`**

Replace the full contents of `apps/tauri/src/features/tabs/index.ts` with:

```ts
export { useTabsStore } from "./store";
export { useTabs } from "./hooks/useTabs";
export { useTabPersistence } from "./hooks/useTabPersistence";
export { useTabIO } from "./hooks/useTabIO";
export { useTabDnD } from "./hooks/useTabDnD";
export { WorkspaceTabs } from "./components/WorkspaceTabs";

export type {
  OpenableTabInput,
  SplitDirection,
  TabClickOpenBehavior,
  TabGroupId,
  TabGroupModel,
  TabId,
  TabModel,
  TabsWorkspaceSnapshot,
} from "./types";
export type {
  CloseTabOptions,
  MoveTabOptions,
  OpenTabOptions,
  TabsState,
} from "./store";
export type {
  CachedTabContent,
  OpenFileResult,
  SaveFileInput,
  UseTabIOOptions,
} from "./hooks/useTabIO";
```

- [ ] **Step 3: Add `useVaultSelection` to `vault/index.ts`**

Add one line to `apps/tauri/src/features/vault/index.ts` after the `useVaultMutations` export:

```ts
export { useVaultSelection } from "./hooks/useVaultSelection";
```

The file should look like (full contents):

```ts
// ---------------------------------------------------------------------------
// Vault feature — barrel export
// Types
// ---------------------------------------------------------------------------

export type {
  UseEditorOptions,
  UseEditorReturn,
} from "../editor/hooks/useEditor";
export { useEditor } from "../editor/hooks/useEditor";
export { BacklinksSidebar } from "./components/BacklinksSidebar";
export { FileTree } from "./components/FileTree";
export { SaveIndicator } from "./components/SaveIndicator";
export { VaultSplash } from "./components/VaultSplash";
export type { UseVaultActionsReturn } from "./hooks/useVaultActions";
export { useVaultActions } from "./hooks/useVaultActions";
export type { UseVaultClipboardReturn } from "./hooks/useVaultClipboard";
export { useVaultClipboard } from "./hooks/useVaultClipboard";
export type { UseVaultContextMenuReturn } from "./hooks/useVaultContextMenu";
export { useVaultContextMenu } from "./hooks/useVaultContextMenu";
export type { UseVaultCreateMutationsReturn } from "./hooks/useVaultCreateMutations";
export { useVaultCreateMutations } from "./hooks/useVaultCreateMutations";
export type { UseVaultDeleteMutationsReturn } from "./hooks/useVaultDeleteMutations";
export { useVaultDeleteMutations } from "./hooks/useVaultDeleteMutations";
export type { UseVaultFileTreeControllerReturn } from "./hooks/useVaultFileTreeController";
export { useVaultFileTreeController } from "./hooks/useVaultFileTreeController";
export type { UseVaultMutationsReturn } from "./hooks/useVaultMutations";
export { useVaultMutations } from "./hooks/useVaultMutations";
export { useVaultSelection } from "./hooks/useVaultSelection";
export type { UseVaultTreeReturn } from "./hooks/useVaultTree";
export { useVaultTree } from "./hooks/useVaultTree";
export type {
  BootResult,
  CreateNoteResult,
  FileChangeEvent,
  FlatTreeNode,
  LinkSuggestion,
  NodeKind,
  SaveStatus,
} from "./types";
```

- [ ] **Step 4: Lint + tsc**

```bash
fish -c "bun run lint 2>&1" | grep "editor/index\|tabs/index\|vault/index"
fish -c "cd /Users/pranavkumar/projects/Basalt/apps/tauri && bunx tsc --noEmit"
```

Expected: no output from lint grep, no tsc errors.

- [ ] **Step 5: Commit**

```bash
git add apps/tauri/src/features/editor/index.ts apps/tauri/src/features/tabs/index.ts apps/tauri/src/features/vault/index.ts
git commit -m "refactor(features): add missing exports to editor, tabs, vault indexes"
```

---

## Task 2: Move workspace files to `features/workspace/`

**Files:**
- Create: `apps/tauri/src/features/workspace/components/commands.tsx`
- Create: `apps/tauri/src/features/workspace/components/WorkspaceOverlays.tsx`
- Create: `apps/tauri/src/features/workspace/hooks/useWorkspaceTabHandlers.ts`
- Create: `apps/tauri/src/features/workspace/hooks/useWorkspaceSidebar.ts`
- Create: `apps/tauri/src/features/workspace/components/WorkspaceView.tsx`
- Delete: `apps/tauri/src/layout/commands.tsx`
- Delete: `apps/tauri/src/layout/WorkspaceOverlays.tsx`
- Delete: `apps/tauri/src/layout/useWorkspaceTabHandlers.ts`
- Delete: `apps/tauri/src/layout/useWorkspaceSidebar.ts`
- Delete: `apps/tauri/src/layout/WorkspaceView.tsx`

**Path note:** From `features/workspace/components/`, layout chrome components are at `../../../layout/ComponentName`. From `features/workspace/hooks/`, other features are at `../../featureName`.

- [ ] **Step 1: Create `features/workspace/components/commands.tsx`**

Content is identical to the old `layout/commands.tsx` except two import paths change:

```tsx
import {
  IconFilePlus,
  IconFileSearch,
  IconPinned,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
  IconX,
  IconLayoutBoardSplit,
  IconRectangleVertical,
} from "@tabler/icons-react";
import { useCommandStore } from "@workspace/editor";
import type React from "react";
import { useEffect, useMemo } from "react";
import { useSearchStore } from "../../search";
import { useSettingsStore } from "../../settings";

export interface AppCommandsProps {
  onCreateNote?: () => void;
  onDeleteNote?: () => void;
  onCloseActiveTab?: () => void;
  onCloseOtherTabs?: () => void;
  onCloseTabsToRight?: () => void;
  onTogglePinActiveTab?: () => void;
  onSplitRight?: () => void;
  onSplitLeft?: () => void;
  onSplitTop?: () => void;
  onSplitBottom?: () => void;
  hasActiveTab?: boolean;
}

export const AppCommands: React.FC<AppCommandsProps> = ({
  onCreateNote,
  onDeleteNote,
  onCloseActiveTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onTogglePinActiveTab,
  onSplitRight,
  onSplitLeft,
  onSplitTop,
  onSplitBottom,
  hasActiveTab = false,
}) => {
  const register = useCommandStore((s) => s.register);
  const unregister = useCommandStore((s) => s.unregister);

  const openSearch   = useSearchStore((s) => s.openSearch);
  const openSwitcher = useSearchStore((s) => s.openSwitcher);
  const openSettings = useSettingsStore((s) => s.open);

  const commands = useMemo(
    () => [
      {
        id: "app:new-file",
        name: "Create New Note",
        category: "File",
        icon: <IconFilePlus size={16} />,
        hotkeys: ["Ctrl+N"],
        callback: () => {
          if (onCreateNote) onCreateNote();
          else console.log("Create new file command executed");
        },
      },
      {
        id: "app:delete-file",
        name: "Delete Current Note",
        category: "File",
        icon: <IconTrash size={16} />,
        callback: () => {
          if (onDeleteNote) onDeleteNote();
          else console.log("Delete file command executed");
        },
      },
      {
        id: "app:extract-selection",
        name: "Extract selection to new note",
        category: "Editor",
        icon: <IconPlus size={16} />,
        callback: () => {
          console.log("Extract selection command executed");
        },
      },
      {
        id: "tabs:close-active",
        name: "Close Current Tab",
        category: "Tabs",
        icon: <IconX size={16} />,
        hotkeys: ["Ctrl+W"],
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onCloseActiveTab) onCloseActiveTab();
        },
      },
      {
        id: "tabs:close-others",
        name: "Close Other Tabs",
        category: "Tabs",
        icon: <IconRectangleVertical size={16} />,
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onCloseOtherTabs) onCloseOtherTabs();
        },
      },
      {
        id: "tabs:close-right",
        name: "Close Tabs to the Right",
        category: "Tabs",
        icon: <IconRectangleVertical size={16} />,
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onCloseTabsToRight) onCloseTabsToRight();
        },
      },
      {
        id: "tabs:toggle-pin",
        name: "Pin/Unpin Current Tab",
        category: "Tabs",
        icon: <IconPinned size={16} />,
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onTogglePinActiveTab) onTogglePinActiveTab();
        },
      },
      {
        id: "tabs:split-right",
        name: "Split Right and Move Tab",
        category: "Tabs",
        icon: <IconLayoutBoardSplit size={16} />,
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onSplitRight) onSplitRight();
        },
      },
      {
        id: "tabs:split-left",
        name: "Split Left and Move Tab",
        category: "Tabs",
        icon: <IconLayoutBoardSplit size={16} />,
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onSplitLeft) onSplitLeft();
        },
      },
      {
        id: "tabs:split-up",
        name: "Split Up and Move Tab",
        category: "Tabs",
        icon: <IconLayoutBoardSplit size={16} />,
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onSplitTop) onSplitTop();
        },
      },
      {
        id: "tabs:split-down",
        name: "Split Down and Move Tab",
        category: "Tabs",
        icon: <IconLayoutBoardSplit size={16} />,
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onSplitBottom) onSplitBottom();
        },
      },
      {
        id: "search:open",
        name: "Search Vault",
        category: "Search",
        icon: <IconSearch size={16} />,
        hotkeys: ["Ctrl+F", "Meta+F"],
        callback: openSearch,
      },
      {
        id: "switcher:open",
        name: "Quick Open File",
        category: "Search",
        icon: <IconFileSearch size={16} />,
        hotkeys: ["Ctrl+O", "Meta+O"],
        callback: openSwitcher,
      },
      {
        id: "app:open-settings",
        name: "Open Settings",
        category: "App",
        icon: <IconSettings size={16} />,
        hotkeys: ["Ctrl+,", "Meta+,"],
        callback: openSettings,
      },
    ],
    [
      hasActiveTab,
      onCloseActiveTab,
      onCloseOtherTabs,
      onCloseTabsToRight,
      onCreateNote,
      onDeleteNote,
      onSplitBottom,
      onSplitLeft,
      onSplitRight,
      onSplitTop,
      onTogglePinActiveTab,
      openSearch,
      openSettings,
      openSwitcher,
    ],
  );

  useEffect(() => {
    commands.forEach((c) => {
      register(c);
    });
    return () => {
      commands.forEach((c) => {
        unregister(c.id);
      });
    };
  }, [commands, register, unregister]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        openSearch();
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        openSwitcher();
      } else if (e.key === ",") {
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [openSearch, openSettings, openSwitcher]);

  return null;
};
```

- [ ] **Step 2: Create `features/workspace/components/WorkspaceOverlays.tsx`**

Content is identical to the old `layout/WorkspaceOverlays.tsx` except the two feature import paths shorten:

```tsx
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import {
  FileTreeContextMenu,
  type FileTreeContextTargetKind,
} from "@workspace/ui/components/file-tree";
import { QuickSwitcher, SearchModal } from "../../search";
import { SettingsModal } from "../../settings";

interface WorkspaceOverlaysProps {
  contextMenu: {
    isOpen: boolean;
    menuState: {
      anchor: { x: number; y: number } | null;
      target: { kind: FileTreeContextTargetKind } | null;
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
    onMenuPaste: () => Promise<void>;
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

- [ ] **Step 3: Create `features/workspace/hooks/useWorkspaceTabHandlers.ts`**

Content is identical to old `layout/useWorkspaceTabHandlers.ts` except the tabs import path changes:

```ts
import { useCallback } from "react";
import type {
  TabGroupId,
  TabGroupModel,
  TabModel,
  SplitDirection,
} from "../../tabs";

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
  const {
    groups,
    activateTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    togglePinTab,
    splitGroupWithTab,
    setFocusedGroup,
  } = tabActions;

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

  const handleTabPinToggle = togglePinTab;

  const handleCloseActiveTab = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) closeTab(group.id, focusedSessionTab.id, { force: true });
  }, [focusedSessionTab, findGroupForTab, closeTab]);

  const handleCloseOtherTabs = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) closeOtherTabs(group.id, focusedSessionTab.id);
  }, [focusedSessionTab, findGroupForTab, closeOtherTabs]);

  const handleCloseTabsToRight = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) closeTabsToRight(group.id, focusedSessionTab.id);
  }, [focusedSessionTab, findGroupForTab, closeTabsToRight]);

  const handleTogglePinActiveTab = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) togglePinTab(focusedSessionTab.id);
  }, [focusedSessionTab, findGroupForTab, togglePinTab]);

  const handleSplitRight = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) splitGroupWithTab(group.id, "right", focusedSessionTab.id);
  }, [focusedSessionTab, findGroupForTab, splitGroupWithTab]);

  const handleSplitLeft = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) splitGroupWithTab(group.id, "left", focusedSessionTab.id);
  }, [focusedSessionTab, findGroupForTab, splitGroupWithTab]);

  const handleSplitUp = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) splitGroupWithTab(group.id, "top", focusedSessionTab.id);
  }, [focusedSessionTab, findGroupForTab, splitGroupWithTab]);

  const handleSplitDown = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) splitGroupWithTab(group.id, "bottom", focusedSessionTab.id);
  }, [focusedSessionTab, findGroupForTab, splitGroupWithTab]);

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

- [ ] **Step 4: Create `features/workspace/hooks/useWorkspaceSidebar.ts`**

Content is identical to old `layout/useWorkspaceSidebar.ts` except import paths update to use feature indexes:

```ts
import { useCallback } from "react";
import { useTabsStore } from "../../tabs";
import {
  useVaultClipboard,
  useVaultContextMenu,
  useVaultFileTreeController,
  useVaultMutations,
  useVaultSelection,
} from "../../vault";
import type {
  TabClickOpenBehavior,
  TabGroupId,
  TabGroupModel,
  TabModel,
} from "../../tabs";
import type { FlatTreeNode } from "../../vault";

interface NoteSelection {
  path: string;
  name: string;
}

interface EditorInterface {
  focusedSessionSelected: NoteSelection | null;
  focusedSessionTab: TabModel | null;
  groups: Record<TabGroupId, TabGroupModel>;
  openInPreview: (opts: { path: string; title: string }) => string;
  openPinned: (opts: { path: string; title: string }) => string;
  setTabTitle: (tabId: string, title: string) => void;
  closeTab: (groupId: TabGroupId, tabId: string, opts: { force: boolean }) => void;
  tabClickOpenBehavior: TabClickOpenBehavior;
}

interface Props {
  vaultPath: string | null;
  treeNodes: FlatTreeNode[];
  visibleNodes: FlatTreeNode[];
  openFolder: (id: string) => void;
  toggleFolder: (id: string) => void;
  refreshTree: () => Promise<void>;
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
      selected: editor.focusedSessionSelected
        ? { name: editor.focusedSessionSelected.name, path: editor.focusedSessionSelected.path }
        : null,
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
  }, [controller.handleConfirmDelete, mutations.pendingDeletePaths]);

  return {
    controller,
    mutations,
    contextMenu,
    selection,
    handleConfirmDeleteWithTabs,
  };
}
```

- [ ] **Step 5: Create `features/workspace/components/WorkspaceView.tsx`**

Content is the same logic as old `layout/WorkspaceView.tsx` with all import paths updated. Chrome component imports go up to `layout/`, feature imports use the feature indexes:

```tsx
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityBar } from "../../../layout/ActivityBar";
import { Sidebar } from "../../../layout/Sidebar";
import { ThemeSelect } from "../../../layout/ThemeSelect";
import { useEditorSessionsStore, usePaneManager } from "../../editor";
import { WorkspaceTabs, useTabs, useTabPersistence, useTabsStore } from "../../tabs";
import type { TabClickOpenBehavior } from "../../tabs";
import { FileTree, VaultSplash, useVaultActions, useVaultTree } from "../../vault";
import type { BootResult, FlatTreeNode } from "../../vault";
import { AppCommands } from "./commands";
import { WorkspaceOverlays } from "./WorkspaceOverlays";
import { useWorkspaceSidebar } from "../hooks/useWorkspaceSidebar";
import { useWorkspaceTabHandlers } from "../hooks/useWorkspaceTabHandlers";

function parseTabClickOpenBehavior(value: unknown): TabClickOpenBehavior {
  if (value === "preview" || value === "pinned" || value === "vscode") {
    return value;
  }
  return "vscode";
}

interface WorkspaceViewProps {
  boot: BootResult;
}

export function WorkspaceView({ boot }: WorkspaceViewProps) {
  const vaultPath = boot.vault_path;
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const {
    treeNodes,
    visibleNodes,
    openFolders,
    toggleFolder,
    openFolder,
    refreshTree,
    setTreeNodes,
  } = useVaultTree(boot.tree);

  const vaultActions = useVaultActions();

  useEffect(() => {
    setTreeNodes(boot.tree);
  }, [boot.tree, setTreeNodes]);

  const findNote = useCallback(
    (name: string): FlatTreeNode | undefined =>
      treeNodes.find(
        (n) =>
          n.kind === "file" && (n.name === name || n.name === `${name}.md`),
      ),
    [treeNodes],
  );

  const { renderGroupPane } = usePaneManager({ findNote });
  const tabs = useTabs();
  const tabClickOpenBehavior = parseTabClickOpenBehavior(
    boot.settings?.tabClickOpenBehavior,
  );
  const {
    openInPreview,
    openPinned,
    setTabTitle,
    setFocusedGroup,
    activateTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    togglePinTab,
    splitGroupWithTab,
  } = tabs;

  useTabPersistence({ workspace: boot.workspace });

  const focusedSessionSelected = useEditorSessionsStore(
    (state) => state.sessions[tabs.focusedGroupId]?.selected ?? null,
  );
  const focusedSessionTab = useMemo(() => {
    const path = focusedSessionSelected?.path;
    if (!path) return null;
    const tabId = `tab:${path}`;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tabId)) {
        return tabs.tabs[tabId] ?? null;
      }
    }
    return null;
  }, [focusedSessionSelected?.path, tabs.groups, tabs.tabs]);

  const { controller, mutations, contextMenu, selection, handleConfirmDeleteWithTabs } =
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

  const handleSearchOpen = useCallback(
    (path: string) => {
      const node = treeNodes.find((n) => n.kind === "file" && n.path === path);
      if (node) {
        const tabId = openInPreview({ path: node.path, title: node.name });
        setTabTitle(tabId, node.name);
      }
    },
    [treeNodes, openInPreview, setTabTitle],
  );

  if (!vaultPath) {
    return (
      <VaultSplash
        isIndexing={vaultActions.isIndexing}
        status={vaultActions.status}
        onOpenVault={vaultActions.pickAndSetVault}
      />
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      <div className="absolute top-10 right-10 z-50 size-fit">
        <ThemeSelect />
      </div>
      <AppCommands
        onCreateNote={controller.createNoteInstant}
        onDeleteNote={controller.handleDeleteFromCommands}
        onCloseActiveTab={tabHandlers.handleCloseActiveTab}
        onCloseOtherTabs={tabHandlers.handleCloseOtherTabs}
        onCloseTabsToRight={tabHandlers.handleCloseTabsToRight}
        onTogglePinActiveTab={tabHandlers.handleTogglePinActiveTab}
        onSplitRight={tabHandlers.handleSplitRight}
        onSplitLeft={tabHandlers.handleSplitLeft}
        onSplitTop={tabHandlers.handleSplitUp}
        onSplitBottom={tabHandlers.handleSplitDown}
        hasActiveTab={Boolean(focusedSessionTab)}
      />
      <ActivityBar />

      <Sidebar
        defaultWidth={boot.workspace?.sidebarWidth as number | undefined}
        collapsed={!sidebarOpen}
        onCreateNote={controller.createNoteInstant}
        onCreateFolder={controller.startFolderInline}
      >
        <FileTree
          visibleNodes={visibleNodes}
          openFolders={openFolders}
          selectedIds={selection.selectedIds}
          cutIds={controller.cutIds}
          onFileClick={controller.onTreeFileClick}
          onFolderToggle={controller.onTreeFolderToggle}
          onContextMenu={controller.onTreeContextMenu}
          onBackgroundContextMenu={controller.onTreeBackgroundContextMenu}
          ghostNode={mutations.ghostNode}
          onCommitEdit={controller.handleCommitEdit}
          onCancelEdit={controller.handleCancelEdit}
        />
      </Sidebar>

      <WorkspaceTabs
        handleTabSelect={tabHandlers.handleTabSelect}
        handleTabClose={tabHandlers.handleTabClose}
        handleTabPinToggle={tabHandlers.handleTabPinToggle}
        renderGroupPane={renderGroupPane}
        tabBarLeftSlot={
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1 pb-2 rounded text-[var(--sat-accent-primary)] hover:bg-[var(--sat-surface-3)] transition-colors "
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen
              ? <IconLayoutSidebarLeftCollapse size={20} stroke={1.5} />
              : <IconLayoutSidebarLeftExpand size={20} stroke={1.5} />}
          </button>
        }
      />

      <WorkspaceOverlays
        contextMenu={contextMenu}
        mutations={mutations}
        controller={controller}
        onConfirmDelete={handleConfirmDeleteWithTabs}
        onSearchOpen={handleSearchOpen}
      />
    </div>
  );
}
```

- [ ] **Step 6: Delete the five old layout files**

```bash
rm apps/tauri/src/layout/WorkspaceView.tsx
rm apps/tauri/src/layout/WorkspaceOverlays.tsx
rm apps/tauri/src/layout/commands.tsx
rm apps/tauri/src/layout/useWorkspaceTabHandlers.ts
rm apps/tauri/src/layout/useWorkspaceSidebar.ts
```

- [ ] **Step 7: Lint + tsc**

```bash
fish -c "bun run lint 2>&1" | grep -v "SettingsModal\|inline-marks"
fish -c "cd /Users/pranavkumar/projects/Basalt/apps/tauri && bunx tsc --noEmit"
```

Expected: lint shows no errors in new files, tsc shows no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/tauri/src/features/workspace/ apps/tauri/src/layout/
git commit -m "refactor(layout): move workspace orchestration into features/workspace"
```

---

## Task 3: Wire up indexes and update routes

**Files:**
- Create: `apps/tauri/src/features/workspace/index.ts`
- Create: `apps/tauri/src/layout/index.tsx`
- Modify: `apps/tauri/src/routes/index.tsx`

- [ ] **Step 1: Create `features/workspace/index.ts`**

```ts
export { WorkspaceView } from "./components/WorkspaceView";
```

- [ ] **Step 2: Create `layout/index.tsx`**

```tsx
export { WorkspaceView } from "../features/workspace";
```

- [ ] **Step 3: Update `routes/index.tsx`**

Change the import from:
```ts
import { WorkspaceView } from "../layout/WorkspaceView";
```
To:
```ts
import { WorkspaceView } from "../layout";
```

Also update the vault types import — it currently imports `BootResult` from `../features/vault/types`. Change to use the vault index:
```ts
import type { BootResult } from "../features/vault";
```

Final `routes/index.tsx`:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { WorkspaceView } from "../layout";
import type { BootResult } from "../features/vault";

interface LoaderData {
  boot: BootResult;
}

export const Route = createFileRoute("/")({
  loader: async (): Promise<LoaderData> => {
    const boot = await invoke<BootResult>("boot");
    return { boot };
  },

  pendingComponent: () => (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 text-[var(--sat-text-muted)]">
      <div className="w-5 h-5 border-2 border-[var(--sat-text-muted)] border-t-[var(--sat-accent-primary)] rounded-full animate-spin" />
      <span className="text-sm text-[var(--sat-text-primary)]">
        Loading vault…
      </span>
    </div>
  ),

  component: function RouteComponent() {
    const { boot } = Route.useLoaderData();
    return <WorkspaceView boot={boot} />;
  },
});
```

- [ ] **Step 4: Lint + tsc**

```bash
fish -c "bun run lint 2>&1" | grep -v "SettingsModal\|inline-marks"
fish -c "cd /Users/pranavkumar/projects/Basalt/apps/tauri && bunx tsc --noEmit"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/tauri/src/features/workspace/index.ts apps/tauri/src/layout/index.tsx apps/tauri/src/routes/index.tsx
git commit -m "refactor(layout): add workspace/index.ts, layout/index.tsx, update routes"
```

---

## Self-Review

**Spec coverage:**
- ✅ `features/workspace/components/` contains WorkspaceView, WorkspaceOverlays, commands — Task 2
- ✅ `features/workspace/hooks/` contains useWorkspaceTabHandlers, useWorkspaceSidebar — Task 2
- ✅ `features/workspace/index.ts` exports WorkspaceView — Task 3
- ✅ `layout/index.tsx` is a single import + re-export — Task 3
- ✅ `routes/index.tsx` imports from `../layout` (not deep path) — Task 3
- ✅ All existing feature indexes patched with missing exports — Task 1
- ✅ Old layout files deleted — Task 2, Step 6

**Placeholder scan:** No TBDs. Every step has complete code.

**Type consistency:**
- `TabClickOpenBehavior` added to `tabs/index.ts` in Task 1 Step 2 and imported from `../../tabs` in Task 2 Step 4 and Step 5 — consistent.
- `useVaultSelection` added to `vault/index.ts` in Task 1 Step 3 and imported from `../../vault` in Task 2 Step 4 — consistent.
- `usePaneManager` added to `editor/index.ts` in Task 1 Step 1 and imported from `../../editor` in Task 2 Step 5 — consistent.
- `WorkspaceTabs` added to `tabs/index.ts` in Task 1 Step 2 and imported from `../../tabs` in Task 2 Step 5 — consistent.
