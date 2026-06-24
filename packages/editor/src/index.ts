// ──────────────────────────────────────────────
// @workspace/editor — Public API barrel
// ──────────────────────────────────────────────
// This is the main entry point. External consumers
// should only import from this barrel:
//
//   import { createEditorExtensions } from "@workspace/editor"
//   import type { EditorConfig } from "@workspace/editor"
// ──────────────────────────────────────────────

export { createEditorExtensions } from "./editor";
export type { ContextMenuState } from "./input/context-menu";
export { contextMenuExtension } from "./input/context-menu";
export type { EditorConfig, FetchLinksFn, FetchTagsFn } from "./types";
