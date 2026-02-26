import { create } from "zustand";
import type {
  OpenableTabInput,
  SplitDirection,
  TabGroupId,
  TabGroupModel,
  TabId,
  TabModel,
  TabsWorkspaceSnapshot,
} from "./types";

interface CloseTabOptions {
  force?: boolean;
}

interface OpenTabOptions {
  groupId?: TabGroupId;
  activate?: boolean;
}

interface MoveTabOptions {
  fromGroupId: TabGroupId;
  toGroupId: TabGroupId;
  tabId: TabId;
  toIndex?: number;
}

interface TabsState {
  tabs: Record<TabId, TabModel>;
  groups: Record<TabGroupId, TabGroupModel>;
  groupOrder: TabGroupId[];
  focusedGroupId: TabGroupId;

  openInPreview: (note: OpenableTabInput, options?: OpenTabOptions) => TabId;
  openPinned: (note: OpenableTabInput, options?: OpenTabOptions) => TabId;
  activateTab: (groupId: TabGroupId, tabId: TabId) => void;
  setFocusedGroup: (groupId: TabGroupId) => void;
  markTabDirty: (tabId: TabId, isDirty: boolean) => void;
  setTabTitle: (tabId: TabId, title: string) => void;
  pinTab: (tabId: TabId) => void;
  unpinTab: (tabId: TabId) => void;
  togglePinTab: (tabId: TabId) => void;
  closeTab: (groupId: TabGroupId, tabId: TabId, options?: CloseTabOptions) => void;
  closeOtherTabs: (groupId: TabGroupId, tabId: TabId) => void;
  closeTabsToRight: (groupId: TabGroupId, tabId: TabId) => void;
  moveTabWithinGroup: (
    groupId: TabGroupId,
    fromIndex: number,
    toIndex: number,
  ) => void;
  moveTabBetweenGroups: (options: MoveTabOptions) => void;
  splitGroupWithTab: (
    groupId: TabGroupId,
    direction: SplitDirection,
    tabId?: TabId,
  ) => TabGroupId;
  removeGroup: (groupId: TabGroupId) => void;
  toWorkspaceSnapshot: () => TabsWorkspaceSnapshot;
  hydrateFromWorkspaceSnapshot: (snapshot: TabsWorkspaceSnapshot) => void;
  reset: () => void;
}

const ROOT_GROUP_ID = "group-root";

function nowMs() {
  return Date.now();
}

function makeGroupId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `group-${crypto.randomUUID()}`;
  }
  return `group-${Math.random().toString(36).slice(2, 10)}`;
}

function makeTabId(path: string) {
  return `tab:${path}`;
}

function titleFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const file = normalized.split("/").pop() ?? path;
  return file.endsWith(".md") ? file.slice(0, -3) : file;
}

function getOrCreateGroup(
  groups: Record<TabGroupId, TabGroupModel>,
  groupId: TabGroupId,
) {
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
    if (group.tabIds.includes(tabId)) return groupId;
  }
  return null;
}

function removeTabFromGroup(group: TabGroupModel, tabId: TabId) {
  group.tabIds = group.tabIds.filter((id) => id !== tabId);

  if (group.previewTabId === tabId) {
    group.previewTabId = null;
  }

  if (group.activeTabId === tabId) {
    const next = group.tabIds.length > 0 ? group.tabIds[group.tabIds.length - 1] : null;
    group.activeTabId = next;
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
  const nextOrder = groupOrder.length > 0 ? [...groupOrder] : [fallbackId];

  if (!nextGroups[fallbackId]) {
    nextGroups[fallbackId] = {
      id: fallbackId,
      tabIds: [],
      activeTabId: null,
      previewTabId: null,
    };
  }

  return { groups: nextGroups, groupOrder: nextOrder, focusedGroupId: fallbackId };
}

function buildInitialState() {
  return {
    tabs: {} as Record<TabId, TabModel>,
    groups: {
      [ROOT_GROUP_ID]: {
        id: ROOT_GROUP_ID,
        tabIds: [],
        activeTabId: null,
        previewTabId: null,
      },
    } as Record<TabGroupId, TabGroupModel>,
    groupOrder: [ROOT_GROUP_ID] as TabGroupId[],
    focusedGroupId: ROOT_GROUP_ID as TabGroupId,
  };
}

export const useTabsStore = create<TabsState>((set, get) => ({
  ...buildInitialState(),

  openInPreview: (note, options) => {
    const requestedGroupId = options?.groupId ?? get().focusedGroupId;
    const activate = options?.activate ?? true;
    const incomingTabId = makeTabId(note.path);

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
    if (activate) {
      targetGroup.activeTabId = incomingTabId;
    }

    set({
      tabs,
      groups,
      groupOrder,
      focusedGroupId: activate ? targetGroup.id : current.focusedGroupId,
    });

    return incomingTabId;
  },

  openPinned: (note, options) => {
    const requestedGroupId = options?.groupId ?? get().focusedGroupId;
    const activate = options?.activate ?? true;
    const incomingTabId = makeTabId(note.path);

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
    if (activate) {
      targetGroup.activeTabId = incomingTabId;
    }

    set({
      tabs,
      groups,
      groupOrder,
      focusedGroupId: activate ? targetGroup.id : current.focusedGroupId,
    });

    return incomingTabId;
  },

  activateTab: (groupId, tabId) => {
    set((state) => {
      const group = state.groups[groupId];
      const tab = state.tabs[tabId];
      if (!group || !tab || !group.tabIds.includes(tabId)) return state;

      return {
        focusedGroupId: groupId,
        groups: {
          ...state.groups,
          [groupId]: {
            ...group,
            activeTabId: tabId,
          },
        },
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...tab,
            lastAccessedAt: nowMs(),
          },
        },
      };
    });
  },

  setFocusedGroup: (groupId) => {
    set((state) => {
      if (!state.groups[groupId]) return state;
      return { focusedGroupId: groupId };
    });
  },

  markTabDirty: (tabId, isDirty) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;
      return {
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...tab,
            isDirty,
          },
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
          [tabId]: {
            ...tab,
            title,
          },
        },
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
          [tabId]: {
            ...tab,
            isPinned: true,
            isPreview: false,
          },
        },
        groups: {
          ...state.groups,
          [groupId]: {
            ...group,
            previewTabId: group.previewTabId === tabId ? null : group.previewTabId,
          },
        },
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
          [tabId]: {
            ...tab,
            isPinned: false,
          },
        },
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

      return {
        tabs: nextTabs,
        groups: normalized.groups,
        groupOrder: normalized.groupOrder,
        focusedGroupId: normalized.focusedGroupId,
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
        if (!keep.has(candidateId)) {
          delete nextTabs[candidateId];
        }
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
        if (!keepSet.has(candidateId)) {
          delete nextTabs[candidateId];
        }
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
      };
    });
  },

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
      tabIds.splice(toIndex, 0, moved);

      return {
        groups: {
          ...state.groups,
          [groupId]: {
            ...group,
            tabIds,
          },
        },
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
      if (tab?.isPreview) {
        nextTo.previewTabId = tabId;
      }

      let nextGroups = {
        ...state.groups,
        [fromGroupId]: nextFrom,
        [toGroupId]: nextTo,
      };
      let nextGroupOrder = [...state.groupOrder];
      let nextFocusedGroupId = toGroupId;

      if (nextFrom.tabIds.length === 0 && nextGroupOrder.length > 1) {
        const { [fromGroupId]: _, ...rest } = nextGroups;
        nextGroups = rest;
        nextGroupOrder = nextGroupOrder.filter((id) => id !== fromGroupId);
      }

      const normalized = ensureAtLeastOneGroup(
        nextGroups,
        nextGroupOrder,
        nextFocusedGroupId,
      );

      return {
        groups: normalized.groups,
        groupOrder: normalized.groupOrder,
        focusedGroupId: normalized.focusedGroupId,
      };
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

      let nextOrder = [...state.groupOrder];
      const sourceIndex = nextOrder.indexOf(groupId);
      const insertIndex =
        direction === "left" || direction === "top"
          ? Math.max(0, sourceIndex)
          : sourceIndex + 1;
      nextOrder.splice(insertIndex, 0, newGroupId);

      if (nextSource.tabIds.length === 0 && nextOrder.length > 1) {
        const { [groupId]: _, ...rest } = nextGroups;
        return {
          groups: rest,
          groupOrder: nextOrder.filter((id) => id !== groupId),
          focusedGroupId: newGroupId,
        };
      }

      return {
        groups: nextGroups,
        groupOrder: nextOrder,
        focusedGroupId: newGroupId,
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

      return {
        tabs: nextTabs,
        groups: {
          ...nextGroups,
          [fallbackGroupId]: {
            ...fallbackGroup,
            activeTabId: fallbackGroup.activeTabId ?? fallbackGroup.tabIds[0] ?? null,
          },
        },
        groupOrder: remainingOrder,
        focusedGroupId:
          state.focusedGroupId === groupId ? fallbackGroupId : state.focusedGroupId,
      };
    });
  },

  toWorkspaceSnapshot: () => {
    const state = get();
    return {
      version: 1,
      focusedGroupId: state.focusedGroupId ?? null,
      groupOrder: [...state.groupOrder],
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

    const tabs = Object.fromEntries(snapshot.tabs.map((tab) => [tab.id, tab]));
    const groups: Record<TabGroupId, TabGroupModel> = {};
    for (const group of snapshot.groups) {
      groups[group.id] = {
        id: group.id,
        tabIds: group.tabIds.filter((tabId) => Boolean(tabs[tabId])),
        activeTabId: group.activeTabId && tabs[group.activeTabId] ? group.activeTabId : null,
        previewTabId:
          group.previewTabId && tabs[group.previewTabId] ? group.previewTabId : null,
      };
    }

    const uniqueOrder = snapshot.groupOrder.filter((groupId) => Boolean(groups[groupId]));
    const normalized = ensureAtLeastOneGroup(
      groups,
      uniqueOrder,
      snapshot.focusedGroupId,
    );

    set({
      tabs,
      groups: normalized.groups,
      groupOrder: normalized.groupOrder,
      focusedGroupId: normalized.focusedGroupId,
    });
  },

  reset: () => {
    set(buildInitialState());
  },
}));

export type { TabsState, CloseTabOptions, OpenTabOptions, MoveTabOptions };
