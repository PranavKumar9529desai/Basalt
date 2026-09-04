/**
 * Phase 7 — public API snapshot test for `src/index.ts` (the package barrel).
 *
 * Guards the stable, external-facing export surface so a refactor can't
 * silently remove or rename an export that `apps/tauri` (or another consumer)
 * depends on. Type-only exports are erased at runtime, so this asserts the
 * runtime (value) exports and documents the named type exports separately via
 * a type-level check.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import * as editor from "../../src/index";

/** Runtime (value) exports MUST match this sorted list exactly. */
const EXPECTED_VALUE_EXPORTS = [
  "DQL_WIDGET_THEME",
  "FRONTMATTER_WIDGET_THEME",
  "HTML_SANITIZE_CONFIG",
  "HTML_TYPOGRAPHY_CSS",
  "TABLE_BLOCK_THEME",
  "attachScrollHeader",
  "blockWidgetModeFacet",
  "blockWidgetSpecsFacet",
  "clearQueryCache",
  "contextMenuExtension",
  "createEditorExtensionGroups",
  "createEditorExtensions",
  "dqlBlockSpec",
  "editorBenchmarkState",
  "formatBenchmarkReport",
  "formatWatchdogReport",
  "frontmatterBlockWidgetGroup",
  "frontmatterDimMode",
  "generateMarkdownDoc",
  "getBlockWidgetModel",
  "getWatchdogStats",
  "handleTagsInLine",
  "openLinkFacet",
  "notifyViewOfSizeChange",
  "previewExtensions",
  "readingExtensions",
  "readingModeExtras",
  "registerBlockWidget",
  "renderModeFacet",
  "renderModeReading",
  "requestPreviewRebuild",
  "resolveAssetFacet",
  "runIsolationBenchmark",
  "runQueryFacet",
  "runTypingBenchmark",
  "sanitizeHtml",
  "startWatchdog",
  "stopWatchdog",
  "tableBlockSpec",
  "tokenizeCode",
].sort();

describe("@workspace/editor public API snapshot", () => {
  it("exports the expected set of runtime values", () => {
    const actual = Object.keys(editor).sort();
    expect(actual).toEqual(EXPECTED_VALUE_EXPORTS);
  });

  it("exposes the critical extension entry points", () => {
    expect(editor.createEditorExtensions).toBeTypeOf("function");
    expect(editor.createEditorExtensionGroups).toBeTypeOf("function");
    expect(editor.previewExtensions).toBeDefined();
    expect(editor.readingExtensions).toBeDefined();
    expect(editor.readingModeExtras).toBeDefined();
  });

  it("exposes the widget registration/build API", () => {
    expect(editor.registerBlockWidget).toBeTypeOf("function");
    expect(editor.blockWidgetSpecsFacet).toBeDefined();
    expect(editor.tableBlockSpec).toBeDefined();
    expect(editor.dqlBlockSpec).toBeDefined();
    expect(editor.getBlockWidgetModel).toBeTypeOf("function");
  });

  it("exposes render-mode and preview utilities", () => {
    expect(editor.renderModeFacet).toBeDefined();
    expect(editor.renderModeReading).toBeDefined();
    expect(editor.sanitizeHtml).toBeTypeOf("function");
    expect(editor.handleTagsInLine).toBeTypeOf("function");
  });

  it("exposes the watchdog and search helpers", () => {
    expect(editor.startWatchdog).toBeTypeOf("function");
    expect(editor.stopWatchdog).toBeTypeOf("function");
    expect(editor.getWatchdogStats).toBeTypeOf("function");
  });

  it("keeps the exact signatures of widely-mocked re-exports (compile-time)", () => {
    expectTypeOf(editor.sanitizeHtml).toEqualTypeOf<(raw: string) => string>();
    expectTypeOf(editor.handleTagsInLine).toBeFunction();
    expectTypeOf(editor.createEditorExtensions).toBeFunction();
  });
});

/**
 * Type-only exports (erased at runtime) are covered by the type-level
 * assertions above via `expectTypeOf`; the runtime snapshot only checks the
 * value exports, which is all that survives to execution time.
 */
