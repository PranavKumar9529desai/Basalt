import type { StateCreator } from "zustand";
import { ensureAtLeastOneGroup, removeTabFromGroup } from "../helpers";
import { normalizeLayoutRoot, removeGroupFromLayoutNode } from "../layout";
import type { TabsState } from "../types";

export interface MoveSlice {
    moveTabWithinGroup: TabsState["moveTabWithinGroup"];
    moveTabBetweenGroups: TabsState["moveTabBetweenGroups"];
}

export const createMoveSlice: StateCreator<TabsState, [], [], MoveSlice> = (
    set,
) => ({
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
            };
        });
    },
});
