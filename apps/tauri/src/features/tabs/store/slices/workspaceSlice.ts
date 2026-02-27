import type { StateCreator } from "zustand";
import { buildInitialState, ensureAtLeastOneGroup } from "../helpers";
import type { TabGroupModel, TabsState } from "../types";

export interface WorkspaceSlice {
    toWorkspaceSnapshot: TabsState["toWorkspaceSnapshot"];
    hydrateFromWorkspaceSnapshot: TabsState["hydrateFromWorkspaceSnapshot"];
    reset: TabsState["reset"];
}

export const createWorkspaceSlice: StateCreator<
    TabsState,
    [],
    [],
    WorkspaceSlice
> = (set, get) => ({
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
        const groups: Record<string, TabGroupModel> = {};
        for (const group of snapshot.groups) {
            groups[group.id] = {
                id: group.id,
                tabIds: group.tabIds.filter((tabId) => Boolean(tabs[tabId])),
                activeTabId:
                    group.activeTabId && tabs[group.activeTabId]
                        ? group.activeTabId
                        : null,
                previewTabId:
                    group.previewTabId && tabs[group.previewTabId]
                        ? group.previewTabId
                        : null,
            };
        }

        const uniqueOrder = snapshot.groupOrder.filter((groupId) =>
            Boolean(groups[groupId]),
        );
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
});
