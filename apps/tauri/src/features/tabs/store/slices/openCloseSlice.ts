import type { StateCreator } from "zustand";
import {
    ensureAtLeastOneGroup,
    findGroupForTab,
    getOrCreateGroup,
    makeTabId,
    nowMs,
    removeTabFromGroup,
    titleFromPath,
} from "../helpers";
import { normalizeLayoutRoot, removeGroupFromLayoutNode } from "../layout";
import type { TabsState } from "../types";

export interface OpenCloseSlice {
    openInPreview: TabsState["openInPreview"];
    openPinned: TabsState["openPinned"];
    activateTab: TabsState["activateTab"];
    closeTab: TabsState["closeTab"];
    closeOtherTabs: TabsState["closeOtherTabs"];
    closeTabsToRight: TabsState["closeTabsToRight"];
}

export const createOpenCloseSlice: StateCreator<TabsState, [], [], OpenCloseSlice> = (
    set,
    get,
) => ({
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
            if (group.activeTabId === tabId && state.focusedGroupId === groupId) {
                return state;
            }

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
});
