import { create } from "zustand";
import { ROOT_GROUP_ID } from "../constants";
import type { TabGroupId, TabGroupModel, TabId, TabModel } from "../types";
import { createCoreSlice } from "./core";
import { createGroupNode } from "./layout";
import { createPersistenceSlice } from "./persistence";
import type { TabsState } from "./types";

const rootId = ROOT_GROUP_ID as TabGroupId;

const initial: Pick<
  TabsState,
  | "tabs"
  | "groups"
  | "groupOrder"
  | "focusedGroupId"
  | "layoutRoot"
  | "persistVersion"
> = {
  tabs: {} as Record<TabId, TabModel>,
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
  persistVersion: 0,
};

export const useTabsStore = create<TabsState>()((set, get, api) => ({
  ...initial,
  ...createCoreSlice(set, get, api),
  ...createPersistenceSlice(set, get, api),
}));

export type {
  CloseTabOptions,
  MoveTabOptions,
  OpenTabOptions,
  TabsState,
} from "./types";
