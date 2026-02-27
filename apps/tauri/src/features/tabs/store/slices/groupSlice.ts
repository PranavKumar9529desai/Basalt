import type { StateCreator } from "zustand";
import { makeGroupId, removeTabFromGroup } from "../helpers";
import type { TabsState } from "../types";

export interface GroupSlice {
    setFocusedGroup: TabsState["setFocusedGroup"];
    splitGroupWithTab: TabsState["splitGroupWithTab"];
    removeGroup: TabsState["removeGroup"];
}

export const createGroupSlice: StateCreator<TabsState, [], [], GroupSlice> = (
    set,
    get,
) => ({
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

            const nextGroups: Record<string, any> = {
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
                        activeTabId:
                            fallbackGroup.activeTabId ?? fallbackGroup.tabIds[0] ?? null,
                    },
                },
                groupOrder: remainingOrder,
                focusedGroupId:
                    state.focusedGroupId === groupId
                        ? fallbackGroupId
                        : state.focusedGroupId,
            };
        });
    },
});
