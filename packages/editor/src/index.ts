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
} from "./perf/benchmark";
export {
  editorBenchmarkState,
  formatBenchmarkReport,
  generateMarkdownDoc,
  runIsolationBenchmark,
  runTypingBenchmark,
} from "./perf/benchmark";
export type { EditorExtensionGroups } from "./editor";
export {
  createEditorExtensionGroups,
  createEditorExtensions,
  previewExtensions,
  readingExtensions,
  readingModeExtras,
} from "./editor";
export type { ContextMenuState } from "./input/context-menu";
export { contextMenuExtension } from "./input/context-menu";
export {
  applyTableMutation,
  tablePositionAtCursor,
} from "./input/table-navigation";
export {
  insertRowAbove,
  insertRowBelow,
  deleteRow,
  insertColumnLeft,
  insertColumnRight,
  deleteColumn,
  setAlignment,
  moveRowUp,
  moveRowDown,
  updateCellText,
} from "./input/table-mutations";
export {
  tableCursorExtension,
  type TableCursorState,
} from "./input/table-cursor";
export type { Alignment, MutationResult } from "./input/table-mutations";
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
  OnPasteImageFn,
  OpenExternalLinkFn,
  ParseFrontmatterFn,
  RunQueryFn,
} from "./types";
export {
  openExternalLinkFacet,
  openTagFacet,
  resolveAssetFacet,
} from "./types";

export {
  dqlBlockSpec,
  DQL_WIDGET_THEME,
  clearQueryCache,
  runQueryFacet,
  openLinkFacet,
} from "./block-widgets/dql-widget";
export {
  taskQueryBlockSpec,
  TASK_WIDGET_THEME,
  clearTaskQueryCache,
  getTasksQueryFacet,
} from "./block-widgets/task-query-widget";
export type {
  TaskQuery,
  TaskFilter,
  TaskSort,
  TaskDisplayOptions,
  ParsedTaskQuery,
  RunTasksQueryFn,
} from "./block-widgets/task-query-widget";
export type {
  QueryResult,
  QueryColumn,
  TypedValue,
  OpenLinkFn,
} from "./block-widgets/dql-widget";
export {
  getBlockWidgetModel,
  requestPreviewRebuild,
} from "./preview/live-preview";
export {
  parseTaskSignifiers,
  cycleStatus,
  statusFromCheckboxChar,
  statusToCheckboxChar,
  TASK_STATUS_CYCLE,
  type TaskSignifiers,
} from "./input/task-signifiers";
export {
  buildTaskLine,
  priorityToEmoji,
  type TaskLineParts,
} from "./lib/task-line";
export { findActiveMarkdownView } from "./lib/active-view";
export { notifyViewOfSizeChange } from "./block-widgets/utils";
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
} from "./block-widgets/frontmatter-block";

export {
  createCodeToggleButton,
  CODE_TOGGLE_BUTTON_THEME,
} from "./block-widgets/code-toggle-button";
export {
  tableBlockSpec,
  TABLE_BLOCK_THEME,
  TableBlockWidget,
} from "./block-widgets/table-widget";
export {
  mermaidBlockSpec,
  clearMermaidCache,
  mermaidThemeFacet,
  defaultMermaidTheme,
} from "./block-widgets/mermaid-widget";
export { MERMAID_WIDGET_THEME } from "./block-widgets/mermaid-theme";
export {
  mathBlockSpec,
  MathInlineWidget,
  handleInlineMathNode,
  clearMathCache,
} from "./block-widgets/math-widget";
export { MATH_WIDGET_THEME } from "./block-widgets/math-theme";
export { mathMarkdownExtension } from "./syntax/math";
export {
  setTableRawMode,
  tableRawModeField,
  isTableInRawMode,
  type TableRawRange,
} from "./block-widgets/table-state";
export {
  setEmbedRawMode,
  embedRawModeField,
  isEmbedInRawMode,
  type EmbedRawRange,
} from "./input/embed-state";
export { attachScrollHeader } from "./scroll-header";
export type { CodeToken } from "./syntax/code-highlighting";
export { tokenizeCode } from "./syntax/code-highlighting";
export { HTML_SANITIZE_CONFIG, sanitizeHtml } from "./preview/html-sanitize";
export { HTML_TYPOGRAPHY_CSS } from "./preview/html-typography";
export { handleTagsInLine } from "./preview/inline-marks";
export type { RenderMode } from "./preview/render-mode";
export { renderModeFacet, renderModeReading } from "./preview/render-mode";
export { classifyMediaExtension, extensionOf } from "./input/embed-utils";
export type {
  AmbiguousPasteRequest,
  AmbiguousPasteResolver,
  PasteRichChoice,
} from "./input/paste-extension";
export type { WatchdogEvent, WatchdogStats } from "./perf/watchdog";
export {
  startWatchdog,
  stopWatchdog,
  getWatchdogStats,
  formatWatchdogReport,
} from "./perf/watchdog";
