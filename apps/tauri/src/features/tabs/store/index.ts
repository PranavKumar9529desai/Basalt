import { create } from "zustand";
import { ROOT_PANE_ID } from "../constants";
import type { TabPaneId, TabId, TabModel } from "../types";
import { createCoreSlice } from "./core";
import { createPersistenceSlice } from "./persistence";
import type { TabsState } from "./types";

const rootId = ROOT_PANE_ID as TabPaneId;

const initial: Pick<TabsState, "tabs" | "pane" | "persistVersion"> = {
  tabs: {} as Record<TabId, TabModel>,
  pane: {
    id: rootId,
    tabIds: [],
    activeTabId: null,
    previewTabId: null,
  },
  persistVersion: 0,
};

export const useTabsStore = create<TabsState>()((set, get, api) => ({
  ...initial,
  ...createCoreSlice(set, get, api),
  ...createPersistenceSlice(set, get, api),
}));

export type { CloseTabOptions, OpenTabOptions, TabsState } from "./types";
