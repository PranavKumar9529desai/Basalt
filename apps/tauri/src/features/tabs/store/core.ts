import type { StateCreator } from "zustand";
import type { TabsState } from "./types";
import { createOpenCloseSlice, type OpenCloseSlice } from "./core/openClose";
import { createPanesSlice, type PanesSlice } from "./core/panes";
import { createPinSlice, type PinSlice } from "./core/pin";
import {
  createPersistenceSyncSlice,
  type PersistenceSyncSlice,
} from "./core/persistenceSync";
import { createNavigationSlice, type NavigationSlice } from "./core/navigation";

/**
 * Core slice — all tab state mutations across one store, composed from the
 * per-concern slices (ADR-038): open/close tabs, pane splits/moves, pin
 * logic, and persistence snapshot sync. The layout tree (ADR-032) is the
 * single source of truth: every mutation targets the active leaf's
 * `tabGroup` (resolved via `activePaneId`) or the leaf containing the
 * affected tab. There is no derived flat pane anymore.
 */
export interface CoreSlice
  extends
    OpenCloseSlice,
    PanesSlice,
    PinSlice,
    NavigationSlice,
    PersistenceSyncSlice {}

export const createCoreSlice: StateCreator<TabsState, [], [], CoreSlice> = (
  set,
  get,
  api,
) => ({
  ...createOpenCloseSlice(set, get, api),
  ...createPanesSlice(set, get, api),
  ...createPinSlice(set, get, api),
  ...createNavigationSlice(set, get, api),
  ...createPersistenceSyncSlice(set, get, api),
});
