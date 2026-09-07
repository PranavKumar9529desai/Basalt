import type { StateCreator } from "zustand";
import type { TabId, TabModel } from "../../types";
import type { TabsState } from "../types";
import {
  collectLeaves,
  findLeaf,
  findLeafByTab,
  findSplit,
  mapLeaf,
  mapSplit,
  removeLeaf,
  splitLeaf,
} from "../../lib/layoutTree";
import { genId, newTabId } from "../../lib/ids";

function nowMs() {
  return Date.now();
}

/** A split duplicates the active tab into the new pane. The clone gets a
 * DISTINCT id (same path) so each pane has an independent editor/controller;
 * sharing a tab id across panes would mount two controllers over one doc. */
function makeCloneTabId(source: TabModel): TabId {
  return newTabId(`${source.id}#clone-${genId()}`);
}

export interface PanesSlice {
  moveTabWithinPane: TabsState["moveTabWithinPane"];
  moveTabToPane: TabsState["moveTabToPane"];
  moveTabToNewPane: TabsState["moveTabToNewPane"];
  splitActivePane: TabsState["splitActivePane"];
  closePane: TabsState["closePane"];
  activatePane: TabsState["activatePane"];
  resizeSplit: TabsState["resizeSplit"];
}

export const createPanesSlice: StateCreator<TabsState, [], [], PanesSlice> = (
  set,
  get,
) => ({
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

  moveTabToPane: (tabId, targetPaneId, insertIndex) => {
    set((state) => {
      const tab = state.tabs[tabId];
      const sourceLeaf = findLeafByTab(state.root, tabId);
      const targetLeaf = findLeaf(state.root, targetPaneId);
      if (!tab || !targetLeaf) return state;
      if (sourceLeaf?.id === targetLeaf.id) return state;

      let root = state.root;

      // Remove from the source pane's group.
      if (sourceLeaf) {
        const sourceTabIds = sourceLeaf.tabGroup.tabIds;
        const remaining = sourceTabIds.filter((id) => id !== tabId);
        const removedIndex = sourceTabIds.indexOf(tabId);
        const activeTabId =
          sourceLeaf.tabGroup.activeTabId === tabId
            ? (remaining[removedIndex] ?? remaining[removedIndex - 1] ?? null)
            : sourceLeaf.tabGroup.activeTabId;
        root = mapLeaf(root, sourceLeaf.id, (l) => ({
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
        }));
      }

      // Insert into the target group at the requested slot.
      const targetTabIds = targetLeaf.tabGroup.tabIds;
      const index =
        insertIndex === undefined
          ? targetTabIds.length
          : Math.max(0, Math.min(insertIndex, targetTabIds.length));
      const targetNext = [...targetTabIds];
      targetNext.splice(index, 0, tabId);
      root = mapLeaf(root, targetLeaf.id, (l) => ({
        ...l,
        tabGroup: { ...l.tabGroup, tabIds: targetNext, activeTabId: tabId },
      }));

      // A dropped tab becomes a persistent tab in the new pane — never a
      // preview that preview-eviction could silently reclaim.
      return {
        root,
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...tab,
            isPinned: true,
            isPreview: false,
            lastAccessedAt: nowMs(),
          },
        },
        activePaneId: targetLeaf.id,
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  moveTabToNewPane: (tabId, paneId, direction, placement = "after") => {
    set((state) => {
      const tab = state.tabs[tabId];
      const sourceLeaf = findLeaf(state.root, paneId);
      if (!tab || !sourceLeaf) return state;
      if (!sourceLeaf.tabGroup.tabIds.includes(tabId)) return state;

      // Remove from the source pane's group.
      const sourceTabIds = sourceLeaf.tabGroup.tabIds;
      const remaining = sourceTabIds.filter((id) => id !== tabId);
      const removedIndex = sourceTabIds.indexOf(tabId);
      const activeTabId =
        sourceLeaf.tabGroup.activeTabId === tabId
          ? (remaining[removedIndex] ?? remaining[removedIndex - 1] ?? null)
          : sourceLeaf.tabGroup.activeTabId;
      const root = mapLeaf(state.root, sourceLeaf.id, (l) => ({
        ...l,
        tabGroup: {
          ...l.tabGroup,
          tabIds: remaining,
          activeTabId,
          previewTabId:
            l.tabGroup.previewTabId === tabId ? null : l.tabGroup.previewTabId,
        },
      }));

      // Split the source pane and drop the tab into the fresh pane. Focus
      // follows the tab (ADR-032: drag out of a pane to create a new one).
      const split = splitLeaf(root, paneId, direction, [tabId], placement);
      return {
        root: split.root,
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...tab,
            isPinned: true,
            isPreview: false,
            lastAccessedAt: nowMs(),
          },
        },
        activePaneId: split.newLeafId,
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  splitActivePane: (direction) => {
    const sourceLeaf = findLeaf(get().root, get().activePaneId);
    const sourceTabId = sourceLeaf?.tabGroup.activeTabId;
    const sourceTab = sourceTabId ? get().tabs[sourceTabId] : undefined;

    // Match Obsidian: split commands are no-ops when no tab is active.
    // Splitting an empty pane produces a meaningless empty sibling that
    // persists across sessions — the source of the "two splits on boot"
    // regression.
    if (!sourceTab) return;

    set((state) => {
      let tabs = state.tabs;
      let newTabIds: TabId[] = [];

      if (sourceTab) {
        // Duplicate the active tab into the new pane (Obsidian behavior,
        // ADR-032 validation): same note, fresh id, clean state.
        const cloneId = makeCloneTabId(sourceTab);
        tabs = {
          ...state.tabs,
          [cloneId]: {
            id: cloneId,
            path: sourceTab.path,
            title: sourceTab.title,
            leafType: sourceTab.leafType,
            viewMode: sourceTab.viewMode ?? "edit",
            isPinned: false,
            isPreview: false,
            isDirty: false,
            createdAt: nowMs(),
            lastAccessedAt: nowMs(),
          },
        };
        newTabIds = [cloneId];
      }

      const result = splitLeaf(
        state.root,
        state.activePaneId,
        direction,
        newTabIds,
      );
      return {
        tabs,
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

  resizeSplit: (splitPaneId, sizes) => {
    set((state) => {
      const split = findSplit(state.root, splitPaneId);
      if (!split) return state;
      if (sizes.length !== split.children.length) return state;

      // Guard against NaN / non-finite values (a drag could hand us garbage).
      const valid = sizes.every(
        (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
      );
      if (!valid) return state;

      const total = sizes.reduce((sum, n) => sum + n, 0);
      const normalized = sizes.map((n) => n / total);

      return {
        root: mapSplit(state.root, splitPaneId, (s) => ({
          ...s,
          children: s.children.map((child, i) => ({
            ...child,
            size: normalized[i],
          })),
        })),
        persistVersion: state.persistVersion + 1,
      };
    });
  },
});