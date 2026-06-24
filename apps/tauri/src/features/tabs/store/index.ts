import { create } from "zustand";
import { createCoreSlice } from "./core";
import { createPersistenceSlice } from "./persistence";
import type { TabsState } from "./types";

export const useTabsStore = create<TabsState>()((set, get, api) => ({
  ...createCoreSlice(set, get, api),
  ...createPersistenceSlice(set, get, api),
}));

export type {
  CloseTabOptions,
  MoveTabOptions,
  OpenTabOptions,
  TabsState,
} from "./types";
