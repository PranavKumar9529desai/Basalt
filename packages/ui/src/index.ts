// ──────────────────────────────────────────────
// @workspace/ui — Public API barrel
// ──────────────────────────────────────────────
// Components are imported individually via deep paths for tree-shaking:
//   import { Button } from "@workspace/ui/components/ui/button"
//   import { FileTree } from "@workspace/ui/components/file-tree"
//
// This barrel only re-exports utilities and hooks.
// ──────────────────────────────────────────────

export { cn } from "./lib/utils";
