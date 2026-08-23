// ──────────────────────────────────────────────────
// @workspace/views — Public API barrel
// ──────────────────────────────────────────────────
// Registry-driven workbench views (ADR-018). External
// consumers should only import from this barrel:
//
//   import { viewRegistry } from "@workspace/views"
//   import type { ViewDescriptor } from "@workspace/views"
// ──────────────────────────────────────────────────

export { LeafRegistry, leafRegistry, LeafServicesProvider, useLeafServices } from "./leaf";
export type {
  LeafDescriptor,
  LeafProps,
  LeafServices,
  LeafTabInfo,
} from "./leaf";
export { ViewRegistry, viewRegistry } from "./registry";
export type {
  ViewDescriptor,
  ViewHeaderActionsType,
  ViewIconType,
  ViewSide,
} from "./types";
