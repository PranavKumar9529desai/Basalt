import type { StateCreator } from "zustand";
import type { TabId, TabModel } from "../../types";
import type { TabsState } from "../types";
import { createLeaf } from "../../lib/layoutTree";
import { label } from "../../lib/ids";

function buildInitialState() {
  const leaf = createLeaf();
  return {
    tabs: {} as Record<TabId, TabModel>,
    root: leaf,
    activePaneId: leaf.id,
    persistVersion: 0,
  };
}

export interface PersistenceSyncSlice {
  updateTabPaths: TabsState["updateTabPaths"];
  reset: TabsState["reset"];
}

/** Sync tab state against an external snapshot of the workspace: repoint
 * open tabs after files/folders moved on disk, or reset to the initial
 * empty snapshot. */
export const createPersistenceSyncSlice: StateCreator<
  TabsState,
  [],
  [],
  PersistenceSyncSlice
> = (set) => ({
  updateTabPaths: (moves) => {
    set((state) => {
      const byFrom = new Map(moves.map((m) => [m.from, m.to]));
      let changed = false;
      const nextTabs: Record<TabId, TabModel> = {};
      for (const [id, tab] of Object.entries(state.tabs)) {
        const to = byFrom.get(tab.path);
        if (!to) {
          nextTabs[id] = tab;
          continue;
        }
        changed = true;
        nextTabs[id] = { ...tab, path: to, title: label(to) };
      }
      if (!changed) return state;
      return {
        tabs: nextTabs,
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  reset: () => {
    set(buildInitialState());
  },
});
