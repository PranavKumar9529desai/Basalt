import { leafRegistry } from "@workspace/views";
import type { StateCreator } from "zustand";
import type { PaneId, LayoutNode } from "../../types";
import type { TabsState } from "../types";
import {
  collectLeaves,
  findLeaf,
  findLeafByTab,
  mapLeaf,
} from "../../lib/layoutTree";
import { label, newTabId } from "../../lib/ids";

function nowMs() {
  return Date.now();
}

/**
 * Resolve the pane a new tab is inserted into. Falls back to the first leaf
 * when `activePaneId` is stale (references a pane no longer in the tree), so
 * `mapLeaf` can never silently no-op and strand a tab in `tabs` without a
 * group (the graph-open orphan regression). Returns null only when the tree
 * has no leaf at all, which cannot happen (root is always a leaf or split).
 */
function resolveInsertPaneId(
  root: LayoutNode,
  activePaneId: PaneId,
): PaneId | null {
  if (findLeaf(root, activePaneId)) return activePaneId;
  const leaves = collectLeaves(root);
  return leaves[0]?.id ?? null;
}

export interface OpenSlice {
  openInPreview: TabsState["openInPreview"];
  openPinned: TabsState["openPinned"];
  openView: TabsState["openView"];
}

export const createOpenSlice: StateCreator<TabsState, [], [], OpenSlice> = (
  set,
  get,
) => ({
  openInPreview: (note, options) => {
    const activate = options?.activate ?? true;
    const incomingTabId = newTabId(note.path);

    // Prefer id lookup, then fall back to path lookup: a moved note's tab
    // keeps its original (path-derived) id after updateTabPaths repoints it,
    // so opening the note at its new path must find that tab, not duplicate.
    let targetId = incomingTabId;
    let existingTab = get().tabs[targetId];
    if (!existingTab) {
      const byPath = Object.values(get().tabs).find(
        (t) => t.path === note.path,
      );
      if (byPath) {
        targetId = byPath.id;
        existingTab = byPath;
      }
    }
    if (existingTab) {
      if (typeof note.line === "number") {
        set((s) => ({
          tabs: {
            ...s.tabs,
            [targetId]: { ...s.tabs[targetId], line: note.line },
          },
        }));
      }
      if (note.focusOnOpen) {
        set((s) => ({
          tabs: {
            ...s.tabs,
            [targetId]: { ...s.tabs[targetId], focusOnOpen: true },
          },
        }));
      }
      if (note.renameOnOpen) {
        set((s) => ({
          tabs: {
            ...s.tabs,
            [targetId]: { ...s.tabs[targetId], renameOnOpen: true },
          },
        }));
      }
      if (activate) get().activateTab(targetId);
      return targetId;
    }

    set((state) => {
      const tabs = { ...state.tabs };
      const timestamp = nowMs();

      // Preview eviction happens within the ACTIVE leaf's tab group.
      const paneId =
        resolveInsertPaneId(state.root, state.activePaneId) ??
        state.activePaneId;
      let inheritedHistory:
        | import("../../types").NavigationHistoryEntry[]
        | undefined;
      const root = mapLeaf(state.root, paneId, (leaf) => {
        const group = leaf.tabGroup;
        let tabIds = group.tabIds;
        let previewTabId = group.previewTabId;
        let activeTabId = group.activeTabId;

        if (previewTabId) {
          const preview = tabs[previewTabId];
          if (preview && !preview.isDirty) {
            if (preview.history) {
              const prevIdx =
                preview.historyIndex ?? preview.history.length - 1;
              inheritedHistory = preview.history.slice(0, prevIdx + 1);
            }
            delete tabs[preview.id];
            tabIds = tabIds.filter((id) => id !== previewTabId);
            previewTabId = null;
          } else if (preview) {
            tabs[previewTabId] = {
              ...preview,
              isPreview: false,
              isPinned: true,
            };
            previewTabId = null;
          }
        }

        tabIds = [...tabIds, incomingTabId];
        if (activate) activeTabId = incomingTabId;

        return {
          ...leaf,
          tabGroup: {
            ...group,
            tabIds,
            activeTabId,
            previewTabId: incomingTabId,
          },
        };
      });

      const leafType =
        note.leafType ?? leafRegistry.leafTypeForPath(note.path) ?? "markdown";
      const title = note.title ?? label(note.path);
      const newEntry = {
        path: note.path,
        title,
        leafType,
        viewMode: "edit" as const,
        line: note.line,
        timestamp,
      };
      const history = inheritedHistory
        ? [...inheritedHistory, newEntry]
        : [newEntry];
      const historyIndex = history.length - 1;

      tabs[incomingTabId] = {
        id: incomingTabId,
        path: note.path,
        title,
        leafType,
        viewMode: "edit",
        isPinned: false,
        isPreview: true,
        isDirty: false,
        createdAt: timestamp,
        lastAccessedAt: timestamp,
        history,
        historyIndex,
        line: note.line,
        focusOnOpen: note.focusOnOpen,
        renameOnOpen: note.renameOnOpen,
      };

      return {
        tabs,
        root,
        activePaneId: paneId,
        persistVersion: get().persistVersion + 1,
      };
    });

    return incomingTabId;
  },

  openPinned: (note, options) => {
    const activate = options?.activate ?? true;
    const incomingTabId = newTabId(note.path);

    // Same path fallback as openInPreview — moved notes keep stale ids.
    let targetId = incomingTabId;
    let existingTab = get().tabs[targetId];
    if (!existingTab) {
      const byPath = Object.values(get().tabs).find(
        (t) => t.path === note.path,
      );
      if (byPath) {
        targetId = byPath.id;
        existingTab = byPath;
      }
    }
    if (existingTab) {
      if (note.focusOnOpen) {
        set((s) => ({
          tabs: {
            ...s.tabs,
            [targetId]: { ...s.tabs[targetId], focusOnOpen: true },
          },
        }));
      }
      if (note.renameOnOpen) {
        set((s) => ({
          tabs: {
            ...s.tabs,
            [targetId]: { ...s.tabs[targetId], renameOnOpen: true },
          },
        }));
      }
      get().pinTab(targetId);
      if (activate) get().activateTab(targetId);
      return targetId;
    }

    set((state) => {
      const tabs = { ...state.tabs };
      const timestamp = nowMs();
      const leafType =
        note.leafType ?? leafRegistry.leafTypeForPath(note.path) ?? "markdown";
      const title = note.title ?? label(note.path);
      const initialEntry = {
        path: note.path,
        title,
        leafType,
        viewMode: "edit" as const,
        line: note.line,
        timestamp,
      };

      tabs[incomingTabId] = {
        id: incomingTabId,
        path: note.path,
        title,
        leafType,
        viewMode: "edit",
        isPinned: true,
        isPreview: false,
        isDirty: false,
        createdAt: timestamp,
        lastAccessedAt: timestamp,
        history: [initialEntry],
        historyIndex: 0,
        line: note.line,
        focusOnOpen: note.focusOnOpen,
        renameOnOpen: note.renameOnOpen,
      };

      const paneId =
        resolveInsertPaneId(state.root, state.activePaneId) ??
        state.activePaneId;
      const root = mapLeaf(state.root, paneId, (leaf) => ({
        ...leaf,
        tabGroup: {
          ...leaf.tabGroup,
          tabIds: [...leaf.tabGroup.tabIds, incomingTabId],
          activeTabId: activate ? incomingTabId : leaf.tabGroup.activeTabId,
        },
      }));

      return {
        tabs,
        root,
        activePaneId: paneId,
        persistVersion: get().persistVersion + 1,
      };
    });

    return incomingTabId;
  },

  openView: (leafType, options) => {
    const activate = options?.activate ?? true;
    const path = options?.path ?? `view://${leafType}`;
    const incomingTabId = newTabId(path);
    const existing =
      get().tabs[incomingTabId] ??
      Object.values(get().tabs).find((t) => t.path === path);
    if (existing) {
      // Self-heal (graph-open regression): a tab in `tabs` that no leaf's
      // tabGroup references is invisible to every pane, and `activateTab`
      // silently no-ops on it — "nothing appears" on every open. Drop the
      // orphan and fall through so the tab is created fresh and attached.
      if (!findLeafByTab(get().root, existing.id)) {
        console.warn(`[openView:${leafType}] tab exists but is in NO pane`, {
          id: existing.id,
          path,
          activePaneId: get().activePaneId,
        });
        set((state) => {
          const tabs = { ...state.tabs };
          delete tabs[existing.id];
          return { tabs, persistVersion: state.persistVersion + 1 };
        });
      } else if (activate) {
        get().activateTab(existing.id);
        return existing.id;
      } else {
        return existing.id;
      }
    }

    set((state) => {
      const tabs = { ...state.tabs };
      const timestamp = nowMs();
      const title = options?.title ?? leafType;
      const initialEntry = {
        path,
        title,
        leafType,
        viewMode: "edit" as const,
        timestamp,
      };

      tabs[incomingTabId] = {
        id: incomingTabId,
        path,
        title,
        leafType,
        viewMode: "edit",
        isPinned: true,
        isPreview: false,
        isDirty: false,
        createdAt: timestamp,
        lastAccessedAt: timestamp,
        history: [initialEntry],
        historyIndex: 0,
      };

      const paneId =
        resolveInsertPaneId(state.root, state.activePaneId) ??
        state.activePaneId;
      const root = mapLeaf(state.root, paneId, (leaf) => ({
        ...leaf,
        tabGroup: {
          ...leaf.tabGroup,
          tabIds: [...leaf.tabGroup.tabIds, incomingTabId],
          activeTabId: activate ? incomingTabId : leaf.tabGroup.activeTabId,
        },
      }));

      return {
        tabs,
        root,
        activePaneId: paneId,
        persistVersion: get().persistVersion + 1,
      };
    });
    return incomingTabId;
  },
});
