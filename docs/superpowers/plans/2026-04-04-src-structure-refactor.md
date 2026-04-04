# src/ Structure Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing `app-shell/` + `commands/` folders with a clean `layout/` layer, move `usePaneManager` into `features/editor/`, fix the tabs store barrel ambiguity, and extract `WorkspaceView` from `routes/index.tsx`.

**Architecture:** All window-chrome components live in `layout/`. Feature domain code lives in `features/`. `routes/index.tsx` becomes a thin TanStack Router shell that delegates rendering to `layout/WorkspaceView.tsx`.

**Tech Stack:** React, TypeScript, TanStack Router, Zustand, Tauri

---

## File Map

**Create:**
- `apps/tauri/src/layout/ActivityBar.tsx` — from `app-shell/AppActivityBar.tsx`, rename export `AppActivityBar` → `ActivityBar`
- `apps/tauri/src/layout/Sidebar.tsx` — from `app-shell/AppSidebar.tsx`, rename export `AppSidebar` → `Sidebar`
- `apps/tauri/src/layout/StatusBar.tsx` — from `app-shell/StatusBar.tsx` (no rename)
- `apps/tauri/src/layout/ThemeProvider.tsx` — from `app-shell/ThemeProvider.tsx` (no changes)
- `apps/tauri/src/layout/ThemeSelect.tsx` — from `app-shell/ThemeSelect.tsx`, fix import path
- `apps/tauri/src/layout/commands.tsx` — from `commands/app-commands.tsx` (no rename)
- `apps/tauri/src/layout/WorkspaceView.tsx` — extracted from `routes/index.tsx`, accepts `boot: BootResult` prop
- `apps/tauri/src/features/editor/PaneInstance.tsx` — from `app-shell/panes/usePaneManager.tsx` (no changes)
- `apps/tauri/src/features/tabs/store/index.ts` — content of current `features/tabs/store.ts`

**Modify:**
- `apps/tauri/src/main.tsx` — update ThemeProvider import path
- `apps/tauri/src/routes/__root.tsx` — update StatusBar import path
- `apps/tauri/src/routes/index.tsx` — replace with thin route shell

**Delete:**
- `apps/tauri/src/app-shell/` (entire folder)
- `apps/tauri/src/commands/` (entire folder)
- `apps/tauri/src/routes/new.tsx`
- `apps/tauri/src/features/tabs/store.ts` (flat barrel, replaced by `store/index.ts`)

---

## Task 1: Create `layout/ActivityBar.tsx`

**Files:**
- Create: `apps/tauri/src/layout/ActivityBar.tsx`

- [ ] **Step 1: Create the file**

```tsx
// apps/tauri/src/layout/ActivityBar.tsx
import { useState } from "react";
import { ActivityBar as ActivityBarUI } from "@workspace/ui/components/activity-bar";
import { IconFolder, IconSearch, IconSettings } from "@tabler/icons-react";

export function ActivityBar() {
  const [activeId, setActiveId] = useState<string>("explorer");

  const topItems = [
    {
      id: "explorer",
      icon: <IconFolder size={20} stroke={1.5} />,
      label: "Explorer",
    },
    {
      id: "search",
      icon: <IconSearch size={20} stroke={1.5} />,
      label: "Search",
    },
  ];

  const bottomItems = [
    {
      id: "settings",
      icon: <IconSettings size={20} stroke={1.5} />,
      label: "Settings",
    },
  ];

  return (
    <ActivityBarUI
      topItems={topItems}
      bottomItems={bottomItems}
      activeId={activeId}
      onItemClick={setActiveId}
    />
  );
}
```

- [ ] **Step 2: Verify lint passes**

Run: `cd apps/tauri && bunx biome check src/layout/ActivityBar.tsx`
Expected: no errors

---

## Task 2: Create `layout/Sidebar.tsx`

**Files:**
- Create: `apps/tauri/src/layout/Sidebar.tsx`

- [ ] **Step 1: Create the file**

```tsx
// apps/tauri/src/layout/Sidebar.tsx
import {
  IconFilePlus,
  IconFolderPlus,
  IconArrowsSort,
  IconChevronUp,
} from "@tabler/icons-react";
import {
  SidebarPanel,
  SidebarHeader,
  type SidebarAction,
} from "@workspace/ui/components/sidebar";
import { invoke } from "@tauri-apps/api/core";
import { type ReactNode, useRef, useCallback } from "react";

interface SidebarProps {
  children: ReactNode;
  defaultWidth?: number;
  onCreateNote: () => void;
  onCreateFolder: () => void;
}

export function Sidebar({
  children,
  defaultWidth,
  onCreateNote,
  onCreateFolder,
}: SidebarProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWidthChange = useCallback((width: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      invoke("set_workspace_key", { key: "sidebarWidth", value: width });
    }, 400);
  }, []);

  const actions: SidebarAction[] = [
    {
      id: "new-note",
      icon: <IconFilePlus size={16} stroke={1.5} />,
      label: "New note",
      onClick: onCreateNote,
    },
    {
      id: "new-folder",
      icon: <IconFolderPlus size={16} stroke={1.5} />,
      label: "New folder",
      onClick: onCreateFolder,
    },
    {
      id: "sort",
      icon: <IconArrowsSort size={16} stroke={1.5} />,
      label: "Sort",
      onClick: () => console.log("Sort toggled"),
    },
    {
      id: "collapse-all",
      icon: <IconChevronUp size={16} stroke={1.5} />,
      label: "Collapse all",
      onClick: () => console.log("Collapse all clicked"),
    },
  ];

  return (
    <SidebarPanel defaultWidth={defaultWidth} onWidthChange={handleWidthChange}>
      <SidebarHeader actions={actions} />
      {children}
    </SidebarPanel>
  );
}
```

- [ ] **Step 2: Verify lint passes**

Run: `cd apps/tauri && bunx biome check src/layout/Sidebar.tsx`
Expected: no errors

---

## Task 3: Create `layout/StatusBar.tsx`, `layout/ThemeProvider.tsx`, `layout/ThemeSelect.tsx`

**Files:**
- Create: `apps/tauri/src/layout/StatusBar.tsx`
- Create: `apps/tauri/src/layout/ThemeProvider.tsx`
- Create: `apps/tauri/src/layout/ThemeSelect.tsx`

- [ ] **Step 1: Create `layout/StatusBar.tsx`**

```tsx
// apps/tauri/src/layout/StatusBar.tsx
export function StatusBar() {
  return (
    <div className="h-6 shrink-0 bg-[var(--sat-surface-2)] border-t border-[var(--sat-layout-border)] flex items-center px-3 text-xs text-[var(--sat-text-muted)]">
      <span>Vault status...</span>
    </div>
  );
}
```

- [ ] **Step 2: Create `layout/ThemeProvider.tsx`**

Copy verbatim from `app-shell/ThemeProvider.tsx` — no changes to content:

```tsx
// apps/tauri/src/layout/ThemeProvider.tsx
import { invoke } from "@tauri-apps/api/core";
import {
  defaultThemeId,
  type ThemeId,
  type ThemeMeta,
  themes,
} from "@workspace/theme/manifest";
import type React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeContextValue = {
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
  themes: ThemeMeta[];
};

const STORAGE_KEY = "basalt.theme";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [themeId, setThemeId] = useState<ThemeId>(defaultThemeId);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (stored && themes.some((t) => t.id === stored)) {
      setThemeId(stored);
    } else {
      const prefersDark = window.matchMedia?.(
        "(prefers-color-scheme: dark)",
      ).matches;
      if (prefersDark && themes.some((t) => t.mode === "dark")) {
        setThemeId("dark" as ThemeId);
      }
    }

    invoke<Record<string, unknown>>("get_settings")
      .then((settings) => {
        const backendTheme = settings.theme as ThemeId;
        if (
          backendTheme &&
          themes.some((t) => t.id === backendTheme) &&
          backendTheme !== themeId
        ) {
          setThemeId(backendTheme);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch settings from backend:", err);
      });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeId);
    window.localStorage.setItem(STORAGE_KEY, themeId);

    invoke("set_setting", { key: "theme", value: themeId }).catch((err) => {
      console.error("Failed to persist theme to backend:", err);
    });
  }, [themeId]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      setTheme: (id) => setThemeId(id),
      themes,
    }),
    [themeId],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
```

- [ ] **Step 3: Create `layout/ThemeSelect.tsx`**

Same content as `app-shell/ThemeSelect.tsx` but with updated import path:

```tsx
// apps/tauri/src/layout/ThemeSelect.tsx
import type React from "react";
import { useTheme } from "./ThemeProvider";

export const ThemeSelect: React.FC = () => {
  const { themeId, setTheme, themes } = useTheme();

  const handleNext = () => {
    const idx = themes.findIndex((t) => t.id === themeId);
    const next = themes[(idx + 1) % themes.length];
    setTheme(next.id);
  };

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--sat-text-muted)]">
      <select
        value={themeId}
        onChange={(e) => setTheme(e.target.value as typeof themeId)}
        className="bg-[var(--sat-surface-2)] border border-[var(--sat-layout-border)] rounded-md px-2 py-1 text-[var(--sat-text-primary)]"
      >
        {themes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleNext}
        className="px-2 py-1 rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] transition-colors"
        title="Cycle theme"
      >
        Next
      </button>
    </div>
  );
};
```

- [ ] **Step 4: Verify lint passes**

Run: `cd apps/tauri && bunx biome check src/layout/StatusBar.tsx src/layout/ThemeProvider.tsx src/layout/ThemeSelect.tsx`
Expected: no errors

---

## Task 4: Create `layout/commands.tsx`

**Files:**
- Create: `apps/tauri/src/layout/commands.tsx`

- [ ] **Step 1: Create the file**

Content is identical to `commands/app-commands.tsx` — only the import path for `useSearchStore` changes:

```tsx
// apps/tauri/src/layout/commands.tsx
import {
  IconFilePlus,
  IconFileSearch,
  IconPinned,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX,
  IconLayoutBoardSplit,
  IconRectangleVertical,
} from "@tabler/icons-react";
import { useCommandStore } from "@workspace/editor";
import type React from "react";
import { useEffect, useMemo } from "react";
import { useSearchStore } from "../features/search";

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
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [openSearch, openSwitcher]);

  return null;
};
```

- [ ] **Step 2: Verify lint passes**

Run: `cd apps/tauri && bunx biome check src/layout/commands.tsx`
Expected: no errors

---

## Task 5: Move `usePaneManager` to `features/editor/PaneInstance.tsx`

**Files:**
- Create: `apps/tauri/src/features/editor/PaneInstance.tsx`

- [ ] **Step 1: Create the file**

Content is identical to `app-shell/panes/usePaneManager.tsx` — only the relative import paths change (`../../features/` → `../` and `../../features/tabs/` → `../tabs/`):

```tsx
// apps/tauri/src/features/editor/PaneInstance.tsx
import { useCallback, useEffect, useRef } from "react";
import { TabGroupFrame, TabsBar } from "@workspace/ui/components/tabs";
import { Editor } from ".";
import { useEditor } from "./hooks/useEditor";
import { useEditorSessionsStore } from "./store";
import {
  ConflictBanner,
  InactiveGroupPane,
  type WorkspaceTabsGroupRenderContext,
} from "../tabs/components/WorkspaceTabs";
import { SaveIndicator } from "../vault/components/SaveIndicator";
import type { FlatTreeNode } from "../vault/types";

export interface PaneManagerOptions {
  findNote: (name: string) => FlatTreeNode | undefined;
}

export function usePaneManager({ findNote }: PaneManagerOptions) {
  const renderGroupPane = useCallback(
    (context: WorkspaceTabsGroupRenderContext) => (
      <PaneInstance
        key={context.groupId}
        context={context}
        findNote={findNote}
      />
    ),
    [findNote],
  );

  return { renderGroupPane };
}

interface PaneInstanceProps {
  context: WorkspaceTabsGroupRenderContext;
  findNote: (name: string) => FlatTreeNode | undefined;
}

function PaneInstance({ context, findNote }: PaneInstanceProps) {
  const {
    group,
    groupTabs,
    activeTab,
    tabDnD,
    markTabDirty,
    onActivateGroup,
    onSelectTab,
    onCloseTab,
    onPinToggle,
  } = context;

  if (!group) {
    return null;
  }

  const editor = useEditor({ findNote });
  const lastLoadedPathRef = useRef<string | null>(null);
  const ensureSession = useEditorSessionsStore((state) => state.ensureSession);
  const updateSession = useEditorSessionsStore((state) => state.updateSession);
  const removeSession = useEditorSessionsStore((state) => state.removeSession);

  useEffect(() => {
    ensureSession(group.id);
    return () => {
      removeSession(group.id);
    };
  }, [ensureSession, group.id, removeSession]);

  useEffect(() => {
    updateSession(group.id, {
      selected: editor.selected,
      content: editor.content,
      backlinks: editor.backlinks,
      saveStatus: editor.saveStatus,
      status: editor.status,
    });
  }, [
    editor.backlinks,
    editor.content,
    editor.saveStatus,
    editor.selected,
    editor.status,
    group.id,
    updateSession,
  ]);

  useEffect(() => {
    if (!activeTab) {
      lastLoadedPathRef.current = null;
      editor.closeNote();
      return;
    }

    const path = activeTab.path;
    if (lastLoadedPathRef.current === path) {
      return;
    }
    lastLoadedPathRef.current = path;
    void editor.loadNote({ name: activeTab.title, path });
  }, [activeTab?.path, activeTab?.title, editor.closeNote, editor.loadNote]);

  const handleEditorChange = useCallback(
    (value: string) => {
      if (activeTab) {
        markTabDirty(activeTab.id, true);
      }
      editor.handleChange(value);
    },
    [activeTab, markTabDirty, editor.handleChange],
  );

  const handlePanePointerDown = useCallback(() => {
    onActivateGroup();
  }, [onActivateGroup]);

  const {
    isDraggingTab,
    getSplitTargetDirection,
    handleTabDragStart,
    handleTabDragOver,
    handleTabDropOnTab,
    handleTabDragEnd,
    handleSplitTargetDragEnter,
    handleSplitTargetDragOver,
    handleSplitTargetDragLeave,
    handleSplitTargetDrop,
  } = tabDnD;

  return (
    <TabGroupFrame
      key={group.id}
      showSplitTargets={isDraggingTab}
      activeSplitTarget={getSplitTargetDirection(group.id)}
      onSplitTargetDragEnter={(direction, event) =>
        handleSplitTargetDragEnter(group.id, direction, event)
      }
      onSplitTargetDragOver={(direction, event) =>
        handleSplitTargetDragOver(group.id, direction, event)
      }
      onSplitTargetDragLeave={(direction) =>
        handleSplitTargetDragLeave(group.id, direction)
      }
      onSplitTargetDrop={(direction, event) =>
        handleSplitTargetDrop(group.id, direction, event)
      }
      tabsBar={
        <TabsBar
          tabs={groupTabs}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          onPinToggle={onPinToggle}
          onTabDragStart={(tabId, event) =>
            handleTabDragStart(group.id, tabId, event)
          }
          onTabDragOver={(_, event) => handleTabDragOver(event)}
          onTabDrop={(tabId, event) =>
            handleTabDropOnTab(group.id, tabId, event)
          }
          onTabDragEnd={(_, event) => handleTabDragEnd(event)}
          rightSlot={
            activeTab ? <SaveIndicator status={editor.saveStatus} /> : undefined
          }
        />
      }
      className="flex-1 min-h-0 border-0"
    >
      {activeTab ? (
        <>
          {editor.saveStatus === "conflict" && (
            <ConflictBanner
              onKeepMine={editor.performSave}
              onDiscard={editor.discardAndReload}
            />
          )}
          <div
            className="flex flex-1  flex-col overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--sat-layout-divider)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--sat-layout-divider)_70%,transparent)] hover:[&::-webkit-scrollbar-thumb]:bg-[var(--sat-layout-divider)]"
            onPointerDownCapture={handlePanePointerDown}
          >
            <Editor
              className="flex-1 min-h-0"
              value={editor.content}
              onChange={handleEditorChange}
              initialContent=""
              onFetchLinks={editor.onFetchLinks}
              onFetchTags={editor.onFetchTags}
              onOpenLink={editor.handleOpenLink}
              onSearch={(query) => {
                console.log("Searching for:", query);
              }}
            />
          </div>
        </>
      ) : (
        <InactiveGroupPane activeTitle={null} onActivate={onActivateGroup} />
      )}
    </TabGroupFrame>
  );
}
```

- [ ] **Step 2: Verify lint passes**

Run: `cd apps/tauri && bunx biome check src/features/editor/PaneInstance.tsx`
Expected: no errors

---

## Task 6: Fix tabs store — create `store/index.ts`

**Files:**
- Create: `apps/tauri/src/features/tabs/store/index.ts`

- [ ] **Step 1: Create `store/index.ts`**

Copy verbatim from the current `features/tabs/store.ts`:

```ts
// apps/tauri/src/features/tabs/store/index.ts
import { create } from "zustand";
import { buildInitialState } from "./helpers";
import { createGroupSlice } from "./slices/groupSlice";
import { createMetaSlice } from "./slices/metaSlice";
import { createMoveSlice } from "./slices/moveSlice";
import { createOpenCloseSlice } from "./slices/openCloseSlice";
import { createWorkspaceSlice } from "./slices/workspaceSlice";
import type { TabsState } from "./types";

export const useTabsStore = create<TabsState>()((set, get, api) => ({
  ...buildInitialState(),
  ...createOpenCloseSlice(set, get, api),
  ...createGroupSlice(set, get, api),
  ...createMoveSlice(set, get, api),
  ...createMetaSlice(set, get, api),
  ...createWorkspaceSlice(set, get, api),
}));

export type {
  CloseTabOptions,
  MoveTabOptions,
  OpenTabOptions,
  TabsState,
} from "./types";
```

- [ ] **Step 2: Verify lint passes**

Run: `cd apps/tauri && bunx biome check src/features/tabs/store/index.ts`
Expected: no errors

---

## Task 7: Create `layout/WorkspaceView.tsx`

**Files:**
- Create: `apps/tauri/src/layout/WorkspaceView.tsx`

- [ ] **Step 1: Create the file**

This is `RouteComponent` from `routes/index.tsx`, converted to accept `boot` as a prop and with all imports updated to their new paths:

```tsx
// apps/tauri/src/layout/WorkspaceView.tsx
import { invoke } from "@tauri-apps/api/core";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { FileTreeContextMenu } from "@workspace/ui/components/file-tree";
import { useCallback, useEffect, useMemo } from "react";
import { ActivityBar } from "./ActivityBar";
import { Sidebar } from "./Sidebar";
import { ThemeSelect } from "./ThemeSelect";
import { AppCommands } from "./commands";
import { useEditorSessionsStore } from "../features/editor/store";
import { usePaneManager } from "../features/editor/PaneInstance";
import { QuickSwitcher, SearchModal } from "../features/search";
import { WorkspaceTabs } from "../features/tabs/components/WorkspaceTabs";
import { useTabPersistence } from "../features/tabs/hooks/useTabPersistence";
import { useTabs } from "../features/tabs/hooks/useTabs";
import { useTabsStore } from "../features/tabs/store";
import type { TabGroupId } from "../features/tabs/types";
import { FileTree } from "../features/vault/components/FileTree";
import { VaultSplash } from "../features/vault/components/VaultSplash";
import { useVaultActions } from "../features/vault/hooks/useVaultActions";
import { useVaultClipboard } from "../features/vault/hooks/useVaultClipboard";
import { useVaultContextMenu } from "../features/vault/hooks/useVaultContextMenu";
import { useVaultFileTreeController } from "../features/vault/hooks/useVaultFileTreeController";
import { useVaultMutations } from "../features/vault/hooks/useVaultMutations";
import { useVaultSelection } from "../features/vault/hooks/useVaultSelection";
import { useVaultTree } from "../features/vault/hooks/useVaultTree";
import type { BootResult, FlatTreeNode } from "../features/vault/types";

type TabClickOpenBehavior = "preview" | "pinned" | "vscode";

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

  const mutations = useVaultMutations();
  const selection = useVaultSelection();
  const clipboard = useVaultClipboard();
  const contextMenu = useVaultContextMenu();
  const controller = useVaultFileTreeController({
    treeNodes,
    visibleNodes,
    vaultPath,
    editor: {
      selected: focusedSessionSelected,
      loadNote: (note) => {
        const tabId = openInPreview({ path: note.path, title: note.name });
        setTabTitle(tabId, note.name);
      },
      closeNote: () => {
        const tab = focusedSessionTab;
        if (!tab) return;
        for (const group of Object.values(tabs.groups)) {
          if (group.tabIds.includes(tab.id)) {
            closeTab(group.id, tab.id, { force: true });
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
        tabClickOpenBehavior === "vscode" ? mode : tabClickOpenBehavior;
      const tabId =
        effectiveMode === "pinned"
          ? openPinned({ path: node.path, title: node.name })
          : openInPreview({ path: node.path, title: node.name });
      setTabTitle(tabId, node.name);
    },
  });

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

  const handleCloseActiveTab = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tab.id)) {
        closeTab(group.id, tab.id, { force: true });
        break;
      }
    }
  }, [closeTab, focusedSessionTab, tabs.groups]);

  const handleCloseOtherTabs = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tab.id)) {
        closeOtherTabs(group.id, tab.id);
        break;
      }
    }
  }, [closeOtherTabs, focusedSessionTab, tabs.groups]);

  const handleCloseTabsToRight = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tab.id)) {
        closeTabsToRight(group.id, tab.id);
        break;
      }
    }
  }, [closeTabsToRight, focusedSessionTab, tabs.groups]);

  const handleTogglePinActiveTab = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    togglePinTab(tab.id);
  }, [focusedSessionTab, togglePinTab]);

  const handleSplitRight = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tab.id)) {
        splitGroupWithTab(group.id, "right", tab.id);
        break;
      }
    }
  }, [focusedSessionTab, splitGroupWithTab, tabs.groups]);

  const handleSplitLeft = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tab.id)) {
        splitGroupWithTab(group.id, "left", tab.id);
        break;
      }
    }
  }, [focusedSessionTab, splitGroupWithTab, tabs.groups]);

  const handleSplitUp = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tab.id)) {
        splitGroupWithTab(group.id, "top", tab.id);
        break;
      }
    }
  }, [focusedSessionTab, splitGroupWithTab, tabs.groups]);

  const handleSplitDown = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tab.id)) {
        splitGroupWithTab(group.id, "bottom", tab.id);
        break;
      }
    }
  }, [focusedSessionTab, splitGroupWithTab, tabs.groups]);

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
        onCreateNote={controller.startNoteInline}
        onDeleteNote={controller.handleDeleteFromCommands}
        onCloseActiveTab={handleCloseActiveTab}
        onCloseOtherTabs={handleCloseOtherTabs}
        onCloseTabsToRight={handleCloseTabsToRight}
        onTogglePinActiveTab={handleTogglePinActiveTab}
        onSplitRight={handleSplitRight}
        onSplitLeft={handleSplitLeft}
        onSplitTop={handleSplitUp}
        onSplitBottom={handleSplitDown}
        hasActiveTab={Boolean(focusedSessionTab)}
      />
      <ActivityBar />

      <Sidebar
        defaultWidth={boot.workspace?.sidebarWidth as number | undefined}
        onCreateNote={controller.startNoteInline}
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
        handleTabSelect={handleTabSelect}
        handleTabClose={handleTabClose}
        handleTabPinToggle={handleTabPinToggle}
        renderGroupPane={renderGroupPane}
      />

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
        onConfirm={handleConfirmDeleteWithTabs}
        isLoading={mutations.isLoading}
      />

      <SearchModal onOpen={handleSearchOpen} />
      <QuickSwitcher onOpen={handleSearchOpen} />
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

Run: `cd apps/tauri && bunx biome check src/layout/WorkspaceView.tsx`
Expected: no errors

---

## Task 8: Update `routes/index.tsx` to thin shell

**Files:**
- Modify: `apps/tauri/src/routes/index.tsx`

- [ ] **Step 1: Replace file content**

```tsx
// apps/tauri/src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { WorkspaceView } from "../layout/WorkspaceView";
import type { BootResult } from "../features/vault/types";

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

- [ ] **Step 2: Verify lint passes**

Run: `cd apps/tauri && bunx biome check src/routes/index.tsx`
Expected: no errors

---

## Task 9: Update `main.tsx` and `routes/__root.tsx`

**Files:**
- Modify: `apps/tauri/src/main.tsx`
- Modify: `apps/tauri/src/routes/__root.tsx`

- [ ] **Step 1: Update `main.tsx` import**

Change line 7 from:
```tsx
import { ThemeProvider } from "./app-shell/ThemeProvider";
```
To:
```tsx
import { ThemeProvider } from "./layout/ThemeProvider";
```

- [ ] **Step 2: Update `routes/__root.tsx` import**

Change line 3 from:
```tsx
import { StatusBar } from "../app-shell/StatusBar";
```
To:
```tsx
import { StatusBar } from "../layout/StatusBar";
```

- [ ] **Step 3: Verify lint passes**

Run: `cd apps/tauri && bunx biome check src/main.tsx src/routes/__root.tsx`
Expected: no errors

---

## Task 10: Delete old files and folders

**Files:**
- Delete: `apps/tauri/src/app-shell/` (entire folder)
- Delete: `apps/tauri/src/commands/` (entire folder)
- Delete: `apps/tauri/src/routes/new.tsx`
- Delete: `apps/tauri/src/features/tabs/store.ts` (flat barrel)

- [ ] **Step 1: Delete old folders and files**

```bash
rm -rf apps/tauri/src/app-shell
rm -rf apps/tauri/src/commands
rm -f apps/tauri/src/routes/new.tsx
rm -f apps/tauri/src/features/tabs/store.ts
```

- [ ] **Step 2: Run full typecheck**

Run: `cd apps/tauri && bunx tsc --noEmit`
Expected: no errors

If you see errors about missing imports from deleted paths, they point to a file not yet updated — fix those imports before proceeding.

---

## Task 11: Final verification and commit

- [ ] **Step 1: Run lint**

```bash
cd apps/tauri && bun run lint
```
Expected: no errors or warnings

- [ ] **Step 2: Run typecheck**

```bash
cd apps/tauri && bunx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/tauri/src/layout \
        apps/tauri/src/features/editor/PaneInstance.tsx \
        apps/tauri/src/features/tabs/store/index.ts \
        apps/tauri/src/routes/index.tsx \
        apps/tauri/src/routes/__root.tsx \
        apps/tauri/src/main.tsx
git rm -r apps/tauri/src/app-shell
git rm -r apps/tauri/src/commands
git rm apps/tauri/src/routes/new.tsx
git rm apps/tauri/src/features/tabs/store.ts
git commit -m "refactor(src): replace app-shell/ with layout/, move PaneInstance to features/editor/"
```
