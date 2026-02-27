import { create } from "zustand";
import { buildInitialState } from "./store/helpers";
import { createGroupSlice } from "./store/slices/groupSlice";
import { createMetaSlice } from "./store/slices/metaSlice";
import { createMoveSlice } from "./store/slices/moveSlice";
import { createOpenCloseSlice } from "./store/slices/openCloseSlice";
import { createWorkspaceSlice } from "./store/slices/workspaceSlice";
import type { TabsState } from "./store/types";

export const useTabsStore = create<TabsState>()((set, get, api) => ({
  ...buildInitialState(),
  ...createOpenCloseSlice(set, get, api),
  ...createGroupSlice(set, get, api),
  ...createMoveSlice(set, get, api),
  ...createMetaSlice(set, get, api),
  ...createWorkspaceSlice(set, get, api),
}));

export type {
  CloseTabOptions,
  MoveTabOptions,
  OpenTabOptions,
  TabsState,
} from "./store/types";
