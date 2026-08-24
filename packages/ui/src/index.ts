/**
 * @workspace/ui — components are imported individually via deep paths for
 * tree-shaking (e.g. "@workspace/ui/components/ui/button"); this barrel only
 * re-exports utilities and hooks.
 */

export { cn } from "./lib/utils";

export {
  useClickOutside,
  useMediaQuery,
  useResizeObserver,
} from "./hooks";
