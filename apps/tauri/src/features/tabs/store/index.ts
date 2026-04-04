import { create } from "zustand";
import { buildInitialState } from "./helpers";
import { createGroupSlice } from "./slices/groupSlice";
import { createMetaSlice } from "./slices/metaSlice";
import { createMoveSlice } from "./slices/moveSlice";
import { createOpenCloseSlice } from "./slices/openCloseSlice";
import { createWorkspaceSlice } from "./slices/workspaceSlice";
import type { TabsState } from "./types";

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
} from "./types";
