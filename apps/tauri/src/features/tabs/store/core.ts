// ---------------------------------------------------------------------------
// Core tabs store — all state mutation logic merged from 4 former slice files
// (groupSlice, metaSlice, moveSlice, openCloseSlice) + inlined helpers.
// No runtime imports from Tauri or other features.
// ---------------------------------------------------------------------------

import type { StateCreator } from "zustand";
import { ROOT_GROUP_ID } from "../constants";
import type { TabGroupId, TabGroupModel, TabId, TabModel } from "../types";
import {
  createGroupNode,
  normalizeLayoutRoot,
  removeGroupFromLayoutNode,
  splitLayoutNode,
} from "./layout";
import type { TabsState } from "./types";

// ---------------------------------------------------------------------------
// Inlined helpers (were in helpers.ts)
// ---------------------------------------------------------------------------

function nowMs() {
  return Date.now();
}

function makeGroupId(): TabGroupId {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `group-${crypto.randomUUID()}` as TabGroupId;
  }
  return `group-${Math.random().toString(36).slice(2, 10)}` as TabGroupId;
}

function makeTabId(path: string): TabId {
  return `tab:${path}` as TabId;
}

function titleFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const file = normalized.split("/").pop() ?? path;
  return file.endsWith(".md") ? file.slice(0, -3) : file;
}

function getOrCreateGroup(
  groups: Record<TabGroupId, TabGroupModel>,
  groupId: TabGroupId,
): TabGroupModel {
  if (groups[groupId]) return groups[groupId];
  const fallback: TabGroupModel = {
    id: groupId,
    tabIds: [],
    activeTabId: null,
    previewTabId: null,
  };
  groups[groupId] = fallback;
  return fallback;
}

function findGroupForTab(
  groups: Record<TabGroupId, TabGroupModel>,
  tabId: TabId,
): TabGroupId | null {
  for (const [groupId, group] of Object.entries(groups)) {
    if (group.tabIds.includes(tabId)) return groupId as TabGroupId;
  }
  return null;
}

function removeTabFromGroup(group: TabGroupModel, tabId: TabId): void {
  group.tabIds = group.tabIds.filter((id) => id !== tabId);
  if (group.previewTabId === tabId) group.previewTabId = null;
  if (group.activeTabId === tabId) {
    group.activeTabId =
      group.tabIds.length > 0
        ? (group.tabIds[group.tabIds.length - 1] as TabId | null)
        : null;
  }
}

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
  const nextOrder =
    groupOrder.length > 0 ? [...groupOrder] : [fallbackId as TabGroupId];
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

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function buildInitialState() {
  return {
    tabs: {} as Record<TabId, TabModel>,
    groups: {
      [ROOT_GROUP_ID]: {
        id: ROOT_GROUP_ID as TabGroupId,
        tabIds: [],
        activeTabId: null,
        previewTabId: null,
      },
    } as Record<TabGroupId, TabGroupModel>,
    groupOrder: [ROOT_GROUP_ID as TabGroupId],
    focusedGroupId: ROOT_GROUP_ID as TabGroupId,
    layoutRoot: createGroupNode(ROOT_GROUP_ID as TabGroupId),
    persistVersion: 0,
  };
}

// ---------------------------------------------------------------------------
// Core slice — all mutations in one StateCreator
// ---------------------------------------------------------------------------

export interface CoreSlice {
  // openClose
  openInPreview: TabsState["openInPreview"];
  openPinned: TabsState["openPinned"];
  activateTab: TabsState["activateTab"];
  closeTab: TabsState["closeTab"];
  closeOtherTabs: TabsState["closeOtherTabs"];
  closeTabsToRight: TabsState["closeTabsToRight"];
  // group
  setFocusedGroup: TabsState["setFocusedGroup"];
  splitGroupWithTab: TabsState["splitGroupWithTab"];
  removeGroup: TabsState["removeGroup"];
  // meta
  markTabDirty: TabsState["markTabDirty"];
  setTabTitle: TabsState["setTabTitle"];
  pinTab: TabsState["pinTab"];
  unpinTab: TabsState["unpinTab"];
  togglePinTab: TabsState["togglePinTab"];
  // move
  moveTabWithinGroup: TabsState["moveTabWithinGroup"];
  moveTabBetweenGroups: TabsState["moveTabBetweenGroups"];

  reset: TabsState["reset"];
}

export const createCoreSlice: StateCreator<TabsState, [], [], CoreSlice> = (
  set,
  get,
) => ({
  // ---- openClose ----

  openInPreview: (note, options) => {
    const requestedGroupId = options?.groupId ?? get().focusedGroupId;
    const activate = options?.activate ?? true;
    const incomingTabId = makeTabId(note.path) as TabId;

    const existingGroupId = findGroupForTab(get().groups, incomingTabId);
    if (existingGroupId) {
      if (activate) get().activateTab(existingGroupId, incomingTabId);
      return incomingTabId;
    }

    const current = get();
    const groups = { ...current.groups };
    const tabs = { ...current.tabs };
    const groupOrder = [...current.groupOrder];
    const targetGroup = getOrCreateGroup(groups, requestedGroupId);
    if (!groupOrder.includes(targetGroup.id)) {
      groupOrder.push(targetGroup.id);
    }

    if (targetGroup.previewTabId) {
      const preview = tabs[targetGroup.previewTabId];
      if (preview && !preview.isDirty) {
        delete tabs[preview.id];
        removeTabFromGroup(targetGroup, preview.id);
      } else if (preview) {
        preview.isPreview = false;
        preview.isPinned = true;
        targetGroup.previewTabId = null;
      }
    }

    const timestamp = nowMs();
    tabs[incomingTabId] = {
      id: incomingTabId,
      path: note.path,
      title: note.title ?? titleFromPath(note.path),
      isPinned: false,
      isPreview: true,
      isDirty: false,
      createdAt: timestamp,
      lastAccessedAt: timestamp,
    };

    targetGroup.tabIds = [...targetGroup.tabIds, incomingTabId];
    targetGroup.previewTabId = incomingTabId;
    if (activate) targetGroup.activeTabId = incomingTabId;

    set({
      tabs,
      groups,
      groupOrder,
      focusedGroupId: activate ? targetGroup.id : current.focusedGroupId,
      persistVersion: get().persistVersion + 1,
    });

    return incomingTabId;
  },

  openPinned: (note, options) => {
    const requestedGroupId = options?.groupId ?? get().focusedGroupId;
    const activate = options?.activate ?? true;
    const incomingTabId = makeTabId(note.path) as TabId;

    const existingGroupId = findGroupForTab(get().groups, incomingTabId);
    if (existingGroupId) {
      get().pinTab(incomingTabId);
      if (activate) get().activateTab(existingGroupId, incomingTabId);
      return incomingTabId;
    }

    const current = get();
    const groups = { ...current.groups };
    const tabs = { ...current.tabs };
    const groupOrder = [...current.groupOrder];
    const targetGroup = getOrCreateGroup(groups, requestedGroupId);
    if (!groupOrder.includes(targetGroup.id)) {
      groupOrder.push(targetGroup.id);
    }

    const timestamp = nowMs();
    tabs[incomingTabId] = {
      id: incomingTabId,
      path: note.path,
      title: note.title ?? titleFromPath(note.path),
      isPinned: true,
      isPreview: false,
      isDirty: false,
      createdAt: timestamp,
      lastAccessedAt: timestamp,
    };

    targetGroup.tabIds = [...targetGroup.tabIds, incomingTabId];
    if (activate) targetGroup.activeTabId = incomingTabId;

    set({
      tabs,
      groups,
      groupOrder,
      focusedGroupId: activate ? targetGroup.id : current.focusedGroupId,
      persistVersion: get().persistVersion + 1,
    });

    return incomingTabId;
  },

  activateTab: (groupId, tabId) => {
    set((state) => {
      const group = state.groups[groupId];
      const tab = state.tabs[tabId];
      if (!group || !tab || !group.tabIds.includes(tabId)) return state;
      if (group.activeTabId === tabId && state.focusedGroupId === groupId) {
        return state;
      }
      return {
        focusedGroupId: groupId,
        groups: {
          ...state.groups,
          [groupId]: { ...group, activeTabId: tabId },
        },
        tabs: {
          ...state.tabs,
          [tabId]: { ...tab, lastAccessedAt: nowMs() },
        },
      };
    });
  },

  closeTab: (groupId, tabId, options) => {
    const force = options?.force ?? true;
    set((state) => {
      const group = state.groups[groupId];
      const tab = state.tabs[tabId];
      if (!group || !tab) return state;
      if (!force && tab.isDirty) return state;

      const nextTabs = { ...state.tabs };
      delete nextTabs[tabId];

      const nextGroups = { ...state.groups };
      const nextGroup = { ...group };
      removeTabFromGroup(nextGroup, tabId);
      nextGroups[groupId] = nextGroup;

      let nextGroupOrder = [...state.groupOrder];
      let nextFocusedGroupId = state.focusedGroupId;

      if (nextGroup.tabIds.length === 0 && nextGroupOrder.length > 1) {
        delete nextGroups[groupId];
        nextGroupOrder = nextGroupOrder.filter((id) => id !== groupId);
        if (nextFocusedGroupId === groupId) {
          nextFocusedGroupId = nextGroupOrder[0];
        }
      }

      const normalized = ensureAtLeastOneGroup(
        nextGroups,
        nextGroupOrder,
        nextFocusedGroupId,
      );
      const layoutAfterRemoval =
        nextGroup.tabIds.length === 0 && nextGroupOrder.length > 1
          ? removeGroupFromLayoutNode(state.layoutRoot, groupId)
          : state.layoutRoot;

      return {
        tabs: nextTabs,
        groups: normalized.groups,
        groupOrder: normalized.groupOrder,
        focusedGroupId: normalized.focusedGroupId,
        layoutRoot: normalizeLayoutRoot(
          layoutAfterRemoval,
          normalized.groups,
          normalized.groupOrder,
        ),
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  closeOtherTabs: (groupId, tabId) => {
    set((state) => {
      const group = state.groups[groupId];
      if (!group || !group.tabIds.includes(tabId)) return state;
      const keep = new Set([tabId]);
      const nextTabs = { ...state.tabs };
      for (const candidateId of group.tabIds) {
        if (!keep.has(candidateId)) delete nextTabs[candidateId];
      }
      return {
        tabs: nextTabs,
        groups: {
          ...state.groups,
          [groupId]: {
            ...group,
            tabIds: [tabId],
            activeTabId: tabId,
            previewTabId: group.previewTabId === tabId ? tabId : null,
          },
        },
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  closeTabsToRight: (groupId, tabId) => {
    set((state) => {
      const group = state.groups[groupId];
      if (!group) return state;
      const currentIndex = group.tabIds.indexOf(tabId);
      if (currentIndex === -1) return state;
      const keepIds = group.tabIds.slice(0, currentIndex + 1);
      const keepSet = new Set(keepIds);
      const nextTabs = { ...state.tabs };
      for (const candidateId of group.tabIds) {
        if (!keepSet.has(candidateId)) delete nextTabs[candidateId];
      }
      return {
        tabs: nextTabs,
        groups: {
          ...state.groups,
          [groupId]: {
            ...group,
            tabIds: keepIds,
            activeTabId:
              group.activeTabId && keepSet.has(group.activeTabId)
                ? group.activeTabId
                : tabId,
            previewTabId:
              group.previewTabId && keepSet.has(group.previewTabId)
                ? group.previewTabId
                : null,
          },
        },
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  // ---- group ----

  setFocusedGroup: (groupId) => {
    set((state) => {
      if (!state.groups[groupId]) return state;
      return { focusedGroupId: groupId };
    });
  },

  splitGroupWithTab: (groupId, direction, tabId) => {
    const sourceGroup = get().groups[groupId];
    if (!sourceGroup) return get().focusedGroupId;
    const targetTabId = tabId ?? sourceGroup.activeTabId;
    if (!targetTabId) return get().focusedGroupId;

    const newGroupId = makeGroupId();
    set((state) => {
      const source = state.groups[groupId];
      if (!source || !source.tabIds.includes(targetTabId)) return state;

      const nextSource = { ...source };
      removeTabFromGroup(nextSource, targetTabId);

      const nextGroups: Record<TabGroupId, TabGroupModel> = {
        ...state.groups,
        [groupId]: nextSource,
        [newGroupId]: {
          id: newGroupId,
          tabIds: [targetTabId],
          activeTabId: targetTabId,
          previewTabId: state.tabs[targetTabId]?.isPreview ? targetTabId : null,
        },
      };

      const nextOrder = [...state.groupOrder];
      const sourceIndex = nextOrder.indexOf(groupId);
      const insertIndex =
        direction === "left" || direction === "top"
          ? Math.max(0, sourceIndex)
          : sourceIndex + 1;
      nextOrder.splice(insertIndex, 0, newGroupId);

      const layoutAfterSplit = splitLayoutNode(
        state.layoutRoot,
        groupId,
        newGroupId,
        direction,
      );

      if (nextSource.tabIds.length === 0 && nextOrder.length > 1) {
        const { [groupId]: _, ...rest } = nextGroups;
        const filteredOrder = nextOrder.filter((id) => id !== groupId);
        const layoutAfterRemoval = removeGroupFromLayoutNode(
          layoutAfterSplit,
          groupId,
        );
        return {
          groups: rest,
          groupOrder: filteredOrder,
          focusedGroupId: newGroupId,
          layoutRoot: normalizeLayoutRoot(
            layoutAfterRemoval,
            rest,
            filteredOrder,
          ),
          persistVersion: state.persistVersion + 1,
        };
      }

      return {
        groups: nextGroups,
        groupOrder: nextOrder,
        focusedGroupId: newGroupId,
        layoutRoot: normalizeLayoutRoot(
          layoutAfterSplit,
          nextGroups,
          nextOrder,
        ),
        persistVersion: state.persistVersion + 1,
      };
    });

    return newGroupId;
  },

  removeGroup: (groupId) => {
    set((state) => {
      if (!state.groups[groupId]) return state;
      if (state.groupOrder.length <= 1) return state;

      const group = state.groups[groupId];
      const remainingOrder = state.groupOrder.filter((id) => id !== groupId);
      const fallbackGroupId = remainingOrder[0];
      const fallbackGroup = state.groups[fallbackGroupId];

      const nextTabs = { ...state.tabs };
      for (const tabId of group.tabIds) {
        delete nextTabs[tabId];
      }

      const { [groupId]: _removed, ...nextGroups } = state.groups;
      const updatedGroups = {
        ...nextGroups,
        [fallbackGroupId]: {
          ...fallbackGroup,
          activeTabId:
            fallbackGroup.activeTabId ?? fallbackGroup.tabIds[0] ?? null,
        },
      };

      const layoutAfterRemoval = removeGroupFromLayoutNode(
        state.layoutRoot,
        groupId,
      );

      return {
        tabs: nextTabs,
        groups: updatedGroups,
        groupOrder: remainingOrder,
        focusedGroupId:
          state.focusedGroupId === groupId
            ? fallbackGroupId
            : state.focusedGroupId,
        layoutRoot: normalizeLayoutRoot(
          layoutAfterRemoval,
          updatedGroups,
          remainingOrder,
        ),
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  // ---- meta ----

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

  pinTab: (tabId) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;
      const groupId = findGroupForTab(state.groups, tabId);
      if (!groupId) return state;
      const group = state.groups[groupId];
      return {
        tabs: {
          ...state.tabs,
          [tabId]: { ...tab, isPinned: true, isPreview: false },
        },
        groups: {
          ...state.groups,
          [groupId]: {
            ...group,
            previewTabId:
              group.previewTabId === tabId ? null : group.previewTabId,
          },
        },
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

  // ---- move ----

  moveTabWithinGroup: (groupId, fromIndex, toIndex) => {
    set((state) => {
      const group = state.groups[groupId];
      if (!group) return state;
      if (
        fromIndex < 0 ||
        fromIndex >= group.tabIds.length ||
        toIndex < 0 ||
        toIndex >= group.tabIds.length ||
        fromIndex === toIndex
      ) {
        return state;
      }
      const tabIds = [...group.tabIds];
      const [moved] = tabIds.splice(fromIndex, 1);
      const insertIndex = Math.max(0, Math.min(toIndex, tabIds.length));
      tabIds.splice(insertIndex, 0, moved);
      return {
        groups: {
          ...state.groups,
          [groupId]: { ...group, tabIds },
        },
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  moveTabBetweenGroups: ({ fromGroupId, toGroupId, tabId, toIndex }) => {
    set((state) => {
      const fromGroup = state.groups[fromGroupId];
      const toGroup = state.groups[toGroupId];
      if (!fromGroup || !toGroup) return state;
      if (!fromGroup.tabIds.includes(tabId)) return state;

      const nextFrom = { ...fromGroup };
      const nextTo = { ...toGroup };
      removeTabFromGroup(nextFrom, tabId);

      const insertAt =
        toIndex === undefined
          ? nextTo.tabIds.length
          : Math.max(0, Math.min(toIndex, nextTo.tabIds.length));
      const nextTabIds = [...nextTo.tabIds];
      nextTabIds.splice(insertAt, 0, tabId);
      nextTo.tabIds = nextTabIds;
      nextTo.activeTabId = tabId;

      const tab = state.tabs[tabId];
      if (tab?.isPreview) nextTo.previewTabId = tabId;

      let nextGroups = {
        ...state.groups,
        [fromGroupId]: nextFrom,
        [toGroupId]: nextTo,
      };
      let nextGroupOrder = [...state.groupOrder];
      const nextFocusedGroupId = toGroupId;

      if (nextFrom.tabIds.length === 0 && nextGroupOrder.length > 1) {
        const { [fromGroupId]: _, ...rest } = nextGroups;
        nextGroups = rest;
        nextGroupOrder = nextGroupOrder.filter((id) => id !== fromGroupId);
      }

      const layoutAfterRemoval =
        nextFrom.tabIds.length === 0 && nextGroupOrder.length > 1
          ? removeGroupFromLayoutNode(state.layoutRoot, fromGroupId)
          : state.layoutRoot;

      const normalized = ensureAtLeastOneGroup(
        nextGroups,
        nextGroupOrder,
        nextFocusedGroupId,
      );

      return {
        groups: normalized.groups,
        groupOrder: normalized.groupOrder,
        focusedGroupId: normalized.focusedGroupId,
        layoutRoot: normalizeLayoutRoot(
          layoutAfterRemoval,
          normalized.groups,
          normalized.groupOrder,
        ),
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  // ---- reset ----

  reset: () => {
    set(buildInitialState());
  },
});
