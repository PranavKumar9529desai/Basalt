import { create, type StoreApi, type UseBoundStore } from "zustand";

import { createCoreSlice } from "../core";
import { createPersistenceSlice } from "../persistence";
import type { TabId, TabModel, LayoutNode } from "../../types";
import type { TabsState } from "../types";
import { createLeaf } from "../../lib/layoutTree";

export type TestStore = UseBoundStore<StoreApi<TabsState>>;

export function createTestStore(): TestStore {
  const initialLeaf = createLeaf();
  return create<TabsState>()(
    (set, get, api) =>
      ({
        tabs: {} as Record<TabId, TabModel>,
        root: initialLeaf as LayoutNode,
        activePaneId: initialLeaf.id,
        persistVersion: 0,
        ...createCoreSlice(set, get, api),
        ...createPersistenceSlice(set, get, api),
      }) as unknown as TabsState,
  );
}
