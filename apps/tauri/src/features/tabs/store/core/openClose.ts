import { leafRegistry } from "@workspace/views";
import type { StateCreator } from "zustand";
import type { PaneId, LayoutNode } from "../../types";
import type { TabsState } from "../types";
import {
  collectLeaves,
  findLeaf,
  findLeafByTab,
  mapLeaf,
  removeLeaf,
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

export interface OpenCloseSlice {
  openInPreview: TabsState["openInPreview"];
  openPinned: TabsState["openPinned"];
  openView: TabsState["openView"];
  activateTab: TabsState["activateTab"];
  closeTab: TabsState["closeTab"];
  closeOtherTabs: TabsState["closeOtherTabs"];
  closeTabsToRight: TabsState["closeTabsToRight"];
  markTabDirty: TabsState["markTabDirty"];
  setTabTitle: TabsState["setTabTitle"];
  setTabViewMode: TabsState["setTabViewMode"];
}

export const createOpenCloseSlice: StateCreator<
  TabsState,
  [],
  [],
  OpenCloseSlice
> = (set, get) => ({
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
      const root = mapLeaf(state.root, paneId, (leaf) => {
        const group = leaf.tabGroup;
        let tabIds = group.tabIds;
        let previewTabId = group.previewTabId;
        let activeTabId = group.activeTabId;

        if (previewTabId) {
          const preview = tabs[previewTabId];
          if (preview && !preview.isDirty) {
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

      tabs[incomingTabId] = {
        id: incomingTabId,
        path: note.path,
        title: note.title ?? label(note.path),
        leafType: leafRegistry.leafTypeForPath(note.path) ?? "markdown",
        viewMode: "edit",
        isPinned: false,
        isPreview: true,
        isDirty: false,
        createdAt: timestamp,
        lastAccessedAt: timestamp,
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
      tabs[incomingTabId] = {
        id: incomingTabId,
        path: note.path,
        title: note.title ?? label(note.path),
        leafType: leafRegistry.leafTypeForPath(note.path) ?? "markdown",
        viewMode: "edit",
        isPinned: true,
        isPreview: false,
        isDirty: false,
        createdAt: timestamp,
        lastAccessedAt: timestamp,
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
      tabs[incomingTabId] = {
        id: incomingTabId,
        path,
        title: options?.title ?? leafType,
        leafType,
        viewMode: "edit",
        isPinned: true,
        isPreview: false,
        isDirty: false,
        createdAt: timestamp,
        lastAccessedAt: timestamp,
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

  activateTab: (tabId) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;
      const leaf = findLeafByTab(state.root, tabId);
      if (!leaf) return state;
      if (
        state.activePaneId === leaf.id &&
        leaf.tabGroup.activeTabId === tabId
      ) {
        return state;
      }
      return {
        root: mapLeaf(state.root, leaf.id, (l) => ({
          ...l,
          tabGroup: { ...l.tabGroup, activeTabId: tabId },
        })),
        activePaneId: leaf.id,
        tabs: {
          ...state.tabs,
          [tabId]: { ...tab, lastAccessedAt: nowMs() },
        },
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  closeTab: (tabId, options) => {
    const force = options?.force ?? true;
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;
      if (!force && tab.isDirty) return state;

      const tabs = { ...state.tabs };
      delete tabs[tabId];

      const leaf = findLeafByTab(state.root, tabId);
      if (!leaf) return { ...state, tabs };

      const group = leaf.tabGroup;
      const remaining = group.tabIds.filter((id) => id !== tabId);
      const leaves = collectLeaves(state.root);
      const isLastInPane = remaining.length === 0;
      const onlyPane = leaves.length === 1;

      // Closing the last tab of a pane closes the pane itself (ADR-032
      // validation), unless it is the only pane left.
      if (isLastInPane && !onlyPane) {
        const newRoot = removeLeaf(state.root, leaf.id);
        if (!newRoot) return { ...state, tabs };
        const remainingLeaves = collectLeaves(newRoot);
        const activePaneId =
          state.activePaneId === leaf.id
            ? (remainingLeaves[0]?.id ?? state.activePaneId)
            : state.activePaneId;
        return {
          tabs,
          root: newRoot,
          activePaneId,
          persistVersion: state.persistVersion + 1,
        };
      }

      const removedIndex = group.tabIds.indexOf(tabId);
      const activeTabId =
        group.activeTabId === tabId
          ? (remaining[removedIndex] ?? remaining[removedIndex - 1] ?? null)
          : group.activeTabId;

      return {
        tabs,
        root: mapLeaf(state.root, leaf.id, (l) => ({
          ...l,
          tabGroup: {
            ...l.tabGroup,
            tabIds: remaining,
            activeTabId,
            previewTabId:
              l.tabGroup.previewTabId === tabId
                ? null
                : l.tabGroup.previewTabId,
          },
        })),
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  closeOtherTabs: (tabId) => {
    set((state) => {
      const leaf = findLeafByTab(state.root, tabId);
      if (!leaf) return state;

      const tabs = { ...state.tabs };
      for (const candidateId of leaf.tabGroup.tabIds) {
        if (candidateId !== tabId) delete tabs[candidateId];
      }

      return {
        tabs,
        root: mapLeaf(state.root, leaf.id, (l) => ({
          ...l,
          tabGroup: {
            ...l.tabGroup,
            tabIds: [tabId],
            activeTabId: tabId,
            previewTabId: l.tabGroup.previewTabId === tabId ? tabId : null,
          },
        })),
        activePaneId: leaf.id,
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  closeTabsToRight: (tabId) => {
    set((state) => {
      const leaf = findLeafByTab(state.root, tabId);
      if (!leaf) return state;

      const currentIndex = leaf.tabGroup.tabIds.indexOf(tabId);
      if (currentIndex === -1) return state;
      const keepIds = leaf.tabGroup.tabIds.slice(0, currentIndex + 1);
      const keepSet = new Set(keepIds);

      const tabs = { ...state.tabs };
      for (const candidateId of leaf.tabGroup.tabIds) {
        if (!keepSet.has(candidateId)) delete tabs[candidateId];
      }

      return {
        tabs,
        root: mapLeaf(state.root, leaf.id, (l) => ({
          ...l,
          tabGroup: {
            ...l.tabGroup,
            tabIds: keepIds,
            activeTabId:
              l.tabGroup.activeTabId && keepSet.has(l.tabGroup.activeTabId)
                ? l.tabGroup.activeTabId
                : tabId,
            previewTabId:
              l.tabGroup.previewTabId && keepSet.has(l.tabGroup.previewTabId)
                ? l.tabGroup.previewTabId
                : null,
          },
        })),
        activePaneId: leaf.id,
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  markTabDirty: (tabId, isDirty) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab || tab.isDirty === isDirty) return state;
      return {
        tabs: {
          ...state.tabs,
          [tabId]: { ...tab, isDirty },
        },
      };
    });
  },

  setTabTitle: (tabId, title) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab || tab.title === title) return state;
      return {
        tabs: {
          ...state.tabs,
          [tabId]: { ...tab, title },
        },
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  setTabViewMode: (tabId, mode) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab || tab.leafType !== "markdown" || tab.viewMode === mode) {
        return state;
      }
      return {
        tabs: { ...state.tabs, [tabId]: { ...tab, viewMode: mode } },
        persistVersion: state.persistVersion + 1,
      };
    });
  },
});