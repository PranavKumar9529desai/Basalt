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
export {
  createEditorExtensionGroups,
  createEditorExtensions,
} from "./editor";
export type { ContextMenuState } from "./input/context-menu";
export { contextMenuExtension } from "./input/context-menu";
export type { EditorConfig, FetchLinksFn, FetchTagsFn } from "./types";
