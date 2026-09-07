/**
 * Regression test: frontmatter widget rendering through the full live-preview
 * pipeline (StateField create → tree walk → decoration set).
 *
 * Verifies the frontmatter block widget dispatches correctly in both live
 * and reading modes when a parser is provided, and the dim fallback works
 * when no parser is available.
 */
import { describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  EditorState,
  EditorSelection,
  type Extension,
} from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import {
  livePreviewField,
  livePreviewPlugin,
} from "../../src/preview/live-preview";
import { renderModeFacet } from "../../src/preview/render-mode";
import { basaltMarkdownExtensions } from "../_helpers/parse-markdown";
import { frontmatterBlockWidgetGroup } from "../../src/block-widgets/frontmatter";
import type { FrontmatterModel, ParseFrontmatterFn } from "../../src/types";
import { dumpDecorations, type DecorationReport } from "../_helpers/dump-decos";

/**
 * Stub parser that faithfully mirrors the real WASM parser's `fm_bounds`
 * contract (crates/basalt-parser/src/frontmatter.rs): the closing `---` must
 * be followed by a newline, else the block is undetectable and the parser
 * returns null. This matters because the editor slices the input to the
 * frontmatter block — if that slice omits the trailing newline after the
 * closing fence, `fm_bounds` returns None and the widget never renders
 * (the ADR-034 regression fixed by `state.doc.lineAt(node.to).to`).
 */
const stubParser: ParseFrontmatterFn = (
  text: string,
): FrontmatterModel | null => {
  if (!text.startsWith("---\n")) return null;
  const lines = text.split("\n");
  const closeIdx = lines.findIndex(
    (l, i) => i > 0 && (l.trim() === "---" || l.trim() === "..."),
  );
  if (closeIdx < 0) return null;
  // fm_bounds requires a `\n` after the closing fence to detect it.
  if (!text.endsWith("\n")) return null;

  const entries = [];
  for (let i = 1; i < closeIdx; i++) {
    const line = lines[i];
    const m = line.match(/^([a-zA-Z_][\w-]*)(\s*):(.*)$/);
    if (m) {
      // Approximate UTF-16 offsets (ASCII-only fixtures, byte == code-unit).
      const lineStart = lines.slice(0, i).join("\n").length + 1;
      entries.push({
        key: m[1],
        value: { type: "text" as const, value: m[3].trim() },
        keySpan: { start: lineStart, end: lineStart + m[1].length },
        valueSpan: {
          start: lineStart + m[1].length + 1,
          end: lineStart + line.length,
        },
      });
    }
  }
  return {
    entries,
    diagnostics: [],
    blockSpan: { start: 0, end: text.length },
  };
};

function buildState(
  doc: string,
  opts: {
    renderMode?: "live" | "reading";
    parser?: ParseFrontmatterFn | null;
  } = {},
) {
  const groupConfig: { parseFrontmatter?: ParseFrontmatterFn } =
    opts.parser === null ? {} : { parseFrontmatter: opts.parser ?? stubParser };
  const extensions: Extension[] = [
    markdown({ base: markdownLanguage, extensions: basaltMarkdownExtensions }),
    ...livePreviewPlugin,
    ...frontmatterBlockWidgetGroup(groupConfig),
  ];
  if (opts.renderMode) extensions.push(renderModeFacet.of(opts.renderMode));
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(doc.length),
    extensions,
  });
  ensureSyntaxTree(state, state.doc.length, 10_000);
  return state;
}

const DOC = "---\ntitle: Hello\n---\n\nBody text";

describe("frontmatter widget — live-preview pipeline", () => {
  it("produces a frontmatter model in live mode (parser provided)", () => {
    const state = buildState(DOC, { renderMode: "live" });
    const lp = state.field(livePreviewField);
    const model = lp.widgetModels["frontmatter"]?.[0] as
      | FrontmatterModel
      | undefined;
    expect(model).toBeDefined();
    expect(model!.entries).toHaveLength(1);
    expect(model!.entries[0].key).toBe("title");
    expect(model!.blockSpan).not.toBeNull();
  });

  it("produces a frontmatter model in reading mode (parser provided)", () => {
    const state = buildState(DOC, { renderMode: "reading" });
    const lp = state.field(livePreviewField);
    const model = lp.widgetModels["frontmatter"]?.[0] as
      | FrontmatterModel
      | undefined;
    expect(model).toBeDefined();
    expect(model!.entries).toHaveLength(1);
  });

  it("returns null model when no parser is provided (dim fallback path)", () => {
    const state = buildState(DOC, { parser: null });
    const lp = state.field(livePreviewField);
    const model = lp.widgetModels["frontmatter"];
    expect(model).toBeUndefined();
  });

  it("produces a replace decoration covering the frontmatter block (live)", () => {
    const state = buildState(DOC, { renderMode: "live" });
    const report: DecorationReport = dumpDecorations(state);
    const replace = report.replaces.find(
      (r) => r.from === 0 && r.widget.includes("Frontmatter"),
    );
    expect(replace).toBeDefined();
    expect(replace!.to).toBeGreaterThan(0);
  });
});
