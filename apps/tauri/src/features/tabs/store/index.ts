import { create } from "zustand";
import { ROOT_PANE_ID } from "../constants";
import type { TabPaneId, TabId, TabModel, LayoutNode } from "../types";
import { createCoreSlice } from "./core";
import { createPersistenceSlice } from "./persistence";
import type { TabsState } from "./types";
import { createLeaf } from "../lib/layoutTree";

const rootId = ROOT_PANE_ID as TabPaneId;
const initialLeaf = createLeaf();

const initial: Pick<
  TabsState,
  "tabs" | "pane" | "root" | "activePaneId" | "persistVersion"
> = {
  tabs: {} as Record<TabId, TabModel>,
  pane: {
    id: rootId,
    tabIds: [],
    activeTabId: null,
    previewTabId: null,
  },
  root: initialLeaf as LayoutNode,
  activePaneId: initialLeaf.id,
  persistVersion: 0,
};

export const useTabsStore = create<TabsState>()((set, get, api) => ({
  ...initial,
  ...createCoreSlice(set, get, api),
  ...createPersistenceSlice(set, get, api),
}));

export type { CloseTabOptions, OpenTabOptions, TabsState } from "./types";
