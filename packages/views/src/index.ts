/**
 * @workspace/views — public API barrel (ADR-018). External consumers should
 * only import from here:
 *   import { viewRegistry } from "@workspace/views"
 */

export {
  LeafRegistry,
  leafRegistry,
  LeafServicesProvider,
  useLeafServices,
} from "./leaf";
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
