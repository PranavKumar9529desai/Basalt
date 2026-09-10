import type { StateCreator } from "zustand";
import type { TabsState } from "../types";
import { createActivateSlice, type ActivateSlice } from "./activate";
import { createCloseSlice, type CloseSlice } from "./close";
import { createOpenSlice, type OpenSlice } from "./open";

export type { ActivateSlice } from "./activate";
export type { CloseSlice } from "./close";
export type { OpenSlice } from "./open";

/** Open/close/activate tab mutations, split by concern (ADR-038): the open
 * path (preview/pinned/view), activation + tab metadata, and closing. */
export interface OpenCloseSlice extends OpenSlice, ActivateSlice, CloseSlice {}

export const createOpenCloseSlice: StateCreator<
  TabsState,
  [],
  [],
  OpenCloseSlice
> = (set, get, api) => ({
  ...createOpenSlice(set, get, api),
  ...createActivateSlice(set, get, api),
  ...createCloseSlice(set, get, api),
});
