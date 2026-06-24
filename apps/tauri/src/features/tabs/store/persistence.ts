// ---------------------------------------------------------------------------
// Persistence slice — workspace snapshot export/hydrate
// ---------------------------------------------------------------------------

import type { StateCreator } from "zustand";
import type { TabGroupId, TabGroupModel, TabId } from "../types";
import { ROOT_GROUP_ID } from "../constants";
import { createGroupNode, normalizeLayoutRoot } from "./layout";
import type { TabsState } from "./types";

// ---- local helpers (simple, no deps on the old helpers.ts) ----

function ensureAtLeastOneGroup(
  groups: Record<TabGroupId, TabGroupModel>,
  groupOrder: TabGroupId[],
  focusedGroupId: TabGroupId | null,
) {
  if (groupOrder.length > 0 && focusedGroupId && groups[focusedGroupId]) {
    return { groups, groupOrder, focusedGroupId };
  }
  const fallbackId = groupOrder[0] ?? ROOT_GROUP_ID;
  const nextGroups = { ...groups };
  const nextOrder = groupOrder.length > 0 ? [...groupOrder] : [fallbackId as TabGroupId];
  if (!nextGroups[fallbackId]) {
    nextGroups[fallbackId] = {
      id: fallbackId as TabGroupId,
      tabIds: [],
      activeTabId: null,
      previewTabId: null,
    };
  }
  return {
    groups: nextGroups,
    groupOrder: nextOrder as TabGroupId[],
    focusedGroupId: fallbackId as TabGroupId,
  };
}

function buildInitialState() {
  const rootId = ROOT_GROUP_ID as TabGroupId;
  return {
    tabs: {} as Record<TabId, import("../types").TabModel>,
    groups: {
      [rootId]: {
        id: rootId,
        tabIds: [],
        activeTabId: null,
        previewTabId: null,
      },
    } as Record<TabGroupId, TabGroupModel>,
    groupOrder: [rootId],
    focusedGroupId: rootId,
    layoutRoot: createGroupNode(rootId),
  };
}

// ---- slice interface ----

export interface PersistenceSlice {
  toWorkspaceSnapshot: TabsState["toWorkspaceSnapshot"];
  hydrateFromWorkspaceSnapshot: TabsState["hydrateFromWorkspaceSnapshot"];
}

export const createPersistenceSlice: StateCreator<
  TabsState,
  [],
  [],
  PersistenceSlice
> = (set, get) => ({
  toWorkspaceSnapshot: () => {
    const state = get();
    return {
      version: 1,
      focusedGroupId: state.focusedGroupId ?? null,
      groupOrder: [...state.groupOrder],
      layout: state.layoutRoot,
      paneFocus: {
        focusedPaneId: state.focusedGroupId ?? null,
      },
      groups: state.groupOrder
        .map((groupId) => state.groups[groupId])
        .filter((group): group is TabGroupModel => Boolean(group))
        .map((group) => ({
          id: group.id,
          tabIds: [...group.tabIds],
          activeTabId: group.activeTabId,
          previewTabId: group.previewTabId,
        })),
      tabs: Object.values(state.tabs).map((tab) => ({ ...tab })),
    };
  },

  hydrateFromWorkspaceSnapshot: (snapshot) => {
    if (snapshot.version !== 1) return;

    const tabs = Object.fromEntries(
      snapshot.tabs.map((tab) => [tab.id, tab]),
    ) as Record<TabId, import("../types").TabModel>;
    const groups: Record<string, TabGroupModel> = {};
    for (const group of snapshot.groups) {
      groups[group.id] = {
        id: group.id as TabGroupId,
        tabIds: group.tabIds.filter((tabId) => Boolean(tabs[tabId])),
        activeTabId:
          group.activeTabId && tabs[group.activeTabId]
            ? (group.activeTabId as TabId)
            : null,
        previewTabId:
          group.previewTabId && tabs[group.previewTabId]
            ? (group.previewTabId as TabId)
            : null,
      };
    }

    const uniqueOrder = snapshot.groupOrder.filter((groupId) =>
      Boolean(groups[groupId]),
    ) as TabGroupId[];
    const normalized = ensureAtLeastOneGroup(
      groups,
      uniqueOrder,
      snapshot.focusedGroupId as TabGroupId,
    );

    const fallbackGroupId = normalized.groupOrder[0] ?? (ROOT_GROUP_ID as TabGroupId);
    const layoutCandidate = snapshot.layout ?? createGroupNode(fallbackGroupId);
    const normalizedLayout = normalizeLayoutRoot(
      layoutCandidate,
      normalized.groups,
      normalized.groupOrder,
    );

    const desiredFocusedGroupId =
      snapshot.paneFocus?.focusedPaneId ?? snapshot.focusedGroupId;
    const finalFocusedGroupId =
      desiredFocusedGroupId && normalized.groups[desiredFocusedGroupId]
        ? (desiredFocusedGroupId as TabGroupId)
        : normalized.focusedGroupId;

    set({
      tabs,
      groups: normalized.groups,
      groupOrder: normalized.groupOrder,
      focusedGroupId: finalFocusedGroupId,
      layoutRoot: normalizedLayout,
    });
  },

  // reset is already in core.ts — hydrateFromWorkspaceSnapshot replaces it
  // for restoration; reset stays in CoreSlice for the "new workspace" path.
});
