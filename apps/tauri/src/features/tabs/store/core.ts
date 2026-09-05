import { leafRegistry } from "@workspace/views";
import type { StateCreator } from "zustand";
import type { TabId, TabModel } from "../types";
import type { TabsState } from "./types";
import {
  createLeaf,
  splitLeaf,
  removeLeaf,
  collectLeaves,
  findLeaf,
  findLeafByTab,
  mapLeaf,
} from "../lib/layoutTree";

function nowMs() {
  return Date.now();
}

function makeTabId(path: string): TabId {
  return `tab:${path}` as TabId;
}

function titleFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const file = normalized.split("/").pop() ?? path;
  return file.endsWith(".md") ? file.slice(0, -3) : file;
}

function buildInitialState() {
  const leaf = createLeaf();
  return {
    tabs: {} as Record<TabId, TabModel>,
    root: leaf,
    activePaneId: leaf.id,
    persistVersion: 0,
  };
}

/**
 * Core slice — all tab state mutations in one StateCreator.
 *
 * The layout tree (ADR-032) is the single source of truth: every mutation
 * targets the active leaf's `tabGroup` (resolved via `activePaneId`) or the
 * leaf containing the affected tab. There is no derived flat pane anymore.
 */
export interface CoreSlice {
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
  pinTab: TabsState["pinTab"];
  unpinTab: TabsState["unpinTab"];
  togglePinTab: TabsState["togglePinTab"];
  moveTabWithinPane: TabsState["moveTabWithinPane"];
  updateTabPaths: TabsState["updateTabPaths"];
  splitActivePane: TabsState["splitActivePane"];
  closePane: TabsState["closePane"];
  activatePane: TabsState["activatePane"];

  reset: TabsState["reset"];
}

export const createCoreSlice: StateCreator<TabsState, [], [], CoreSlice> = (
  set,
  get,
) => ({
  openInPreview: (note, options) => {
    const activate = options?.activate ?? true;
    const incomingTabId = makeTabId(note.path) as TabId;

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
      const root = mapLeaf(state.root, state.activePaneId, (leaf) => {
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
        title: note.title ?? titleFromPath(note.path),
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
        persistVersion: get().persistVersion + 1,
      };
    });

    return incomingTabId;
  },

  openPinned: (note, options) => {
    const activate = options?.activate ?? true;
    const incomingTabId = makeTabId(note.path) as TabId;

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
        title: note.title ?? titleFromPath(note.path),
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

      const root = mapLeaf(state.root, state.activePaneId, (leaf) => ({
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
        persistVersion: get().persistVersion + 1,
      };
    });

    return incomingTabId;
  },

  openView: (leafType, options) => {
    const activate = options?.activate ?? true;
    const path = options?.path ?? `view://${leafType}`;
    const incomingTabId = makeTabId(path) as TabId;
    const existing =
      get().tabs[incomingTabId] ??
      Object.values(get().tabs).find((t) => t.path === path);
    if (existing) {
      if (activate) get().activateTab(existing.id);
      return existing.id;
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

      const root = mapLeaf(state.root, state.activePaneId, (leaf) => ({
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
            previewTabId:
              l.tabGroup.previewTabId === tabId ? tabId : null,
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
              l.tabGroup.previewTabId &&
              keepSet.has(l.tabGroup.previewTabId)
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

  pinTab: (tabId) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;
      const leaf = findLeafByTab(state.root, tabId);
      return {
        tabs: {
          ...state.tabs,
          [tabId]: { ...tab, isPinned: true, isPreview: false },
        },
        root:
          leaf && leaf.tabGroup.previewTabId === tabId
            ? mapLeaf(state.root, leaf.id, (l) => ({
                ...l,
                tabGroup: { ...l.tabGroup, previewTabId: null },
              }))
            : state.root,
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  unpinTab: (tabId) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;
      return {
        tabs: {
          ...state.tabs,
          [tabId]: { ...tab, isPinned: false },
        },
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  togglePinTab: (tabId) => {
    const tab = get().tabs[tabId];
    if (!tab) return;
    if (tab.isPinned) {
      get().unpinTab(tabId);
    } else {
      get().pinTab(tabId);
    }
  },

  moveTabWithinPane: (fromIndex, toIndex, paneId) => {
    set((state) => {
      const targetId = paneId ?? state.activePaneId;
      const leaf = findLeaf(state.root, targetId);
      if (!leaf) return state;
      const tabIds = leaf.tabGroup.tabIds;
      if (
        fromIndex < 0 ||
        fromIndex >= tabIds.length ||
        toIndex < 0 ||
        toIndex >= tabIds.length ||
        fromIndex === toIndex
      ) {
        return state;
      }
      const next = [...tabIds];
      const [moved] = next.splice(fromIndex, 1);
      const insertIndex = Math.max(0, Math.min(toIndex, next.length));
      next.splice(insertIndex, 0, moved);
      return {
        root: mapLeaf(state.root, targetId, (l) => ({
          ...l,
          tabGroup: { ...l.tabGroup, tabIds: next },
        })),
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  updateTabPaths: (moves) => {
    set((state) => {
      const byFrom = new Map(moves.map((m) => [m.from, m.to]));
      let changed = false;
      const nextTabs: Record<TabId, TabModel> = {};
      for (const [id, tab] of Object.entries(state.tabs)) {
        const to = byFrom.get(tab.path);
        if (!to) {
          nextTabs[id] = tab;
          continue;
        }
        changed = true;
        nextTabs[id] = { ...tab, path: to, title: titleFromPath(to) };
      }
      if (!changed) return state;
      return {
        tabs: nextTabs,
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  reset: () => {
    set(buildInitialState());
  },

  // --- Split Pane Layout Tree actions (ADR-032 Phase 3) ---

  splitActivePane: (direction) => {
    set((state) => {
      const result = splitLeaf(state.root, state.activePaneId, direction);
      return {
        root: result.root,
        activePaneId: result.newLeafId,
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  closePane: (paneId) => {
    set((state) => {
      // Don't close if it's the last pane
      const leaves = collectLeaves(state.root);
      if (leaves.length <= 1) return state;

      const targetLeaf = leaves.find((leaf) => leaf.id === paneId);
      const newRoot = removeLeaf(state.root, paneId);
      if (!newRoot) return state; // should never happen (last pane guard)

      // The pane's tabs close with it.
      const tabs = { ...state.tabs };
      if (targetLeaf) {
        for (const tabId of targetLeaf.tabGroup.tabIds) delete tabs[tabId];
      }

      // If the active pane closed, activate the first remaining leaf.
      const remaining = collectLeaves(newRoot);
      const activePaneId =
        state.activePaneId === paneId
          ? (remaining[0]?.id ?? state.activePaneId)
          : state.activePaneId;

      return {
        tabs,
        root: newRoot,
        activePaneId,
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  activatePane: (paneId) => {
    set((state) => {
      if (state.activePaneId === paneId) return state;
      return { activePaneId: paneId };
    });
  },
});