/**
 * @workspace/editor — public API barrel. External consumers should only
 * import from here:
 *   import { createEditorExtensions } from "@workspace/editor"
 */

export type {
  BenchmarkReportRow,
  IsolationBenchmarkSample,
  IsolationVariant,
  TypingBenchmarkOptions,
  TypingBenchmarkSample,
} from "./benchmark";
export {
  editorBenchmarkState,
  formatBenchmarkReport,
  generateMarkdownDoc,
  runIsolationBenchmark,
  runTypingBenchmark,
} from "./benchmark";
export type { EditorExtensionGroups } from "./editor";
export { createEditorExtensionGroups, createEditorExtensions, previewExtensions } from "./editor";
export type { ContextMenuState } from "./input/context-menu";
export { contextMenuExtension } from "./input/context-menu";
export type {
  EditorConfig,
  FrontmatterEditFn,
  FrontmatterFetch,
  FetchLinksFn,
  FetchTagsFn,
  FrontmatterModel,
  FrontmatterEntry,
  FrontmatterValue,
  FrontmatterDiagnostic,
  FrontmatterDiagnosticKind,
  ParseFrontmatterFn,
  RunQueryFn,
} from "./types";

export { dqlBlockSpec, DQL_WIDGET_THEME, clearQueryCache, runQueryFacet, openLinkFacet } from "./block-widgets/dql-widget";
export type { QueryResult, QueryColumn, TypedValue, OpenLinkFn } from "./block-widgets/dql-widget";
export {
  getBlockWidgetModel,
  requestPreviewRebuild,
} from "./preview/live-preview";
export type { BlockWidgetSpec } from "./block-widgets/registry";
export {
  blockWidgetModeFacet,
  blockWidgetSpecsFacet,
  registerBlockWidget,
} from "./block-widgets/registry";
export {
  frontmatterBlockWidgetGroup,
  frontmatterDimMode,
  FRONTMATTER_WIDGET_THEME,
} from "./block-widgets/frontmatter";

export { tableBlockSpec, TABLE_BLOCK_THEME } from "./block-widgets/table-widget";
export { attachScrollHeader } from "./scroll-header";
export type { CodeToken } from "./syntax/code-highlighting";
export { tokenizeCode } from "./syntax/code-highlighting";
export { HTML_SANITIZE_CONFIG, sanitizeHtml } from "./preview/html-sanitize";
export { HTML_TYPOGRAPHY_CSS } from "./preview/html-typography";
