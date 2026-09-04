/**
 * DQL widget layout regression — ADR fix: async query results change the
 * widget's DOM height after CodeMirror's initial measurement. If the widget
 * doesn't notify the editor, CM's cached height stays stale and content below
 * the DQL block overlaps the result.
 *
 * The fix calls `view.requestMeasure()` after the async result (or error)
 * replaces the loading placeholder, and after a lazy image loads (embed
 * widgets). This test pins that behavior by rendering the widget through a
 * real view facade.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { EditorState, type Extension } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Table } from "@lezer/markdown";
import type { EditorView } from "@codemirror/view";
import {
  clearQueryCache,
  DqlResultWidget,
  runQueryFacet,
} from "../src/block-widgets/dql-widget";
import type { QueryResult } from "../src/block-widgets/dql-widget";
import { EmbedMediaWidget } from "../src/input/embed-media";
import { wikiLinkExtension } from "../src/syntax/wiki-links";
import { livePreviewField, livePreviewPlugin } from "../src/preview/live-preview";
import { blockWidgetSpecsFacet } from "../src/block-widgets/registry";
import { dqlBlockSpec } from "../src/block-widgets/dql-widget";

function mockView(): { view: EditorView; requestMeasure: ReturnType<typeof vi.fn> } {
  const requestMeasure = vi.fn();
  const view = { requestMeasure } as unknown as EditorView;
  return { view, requestMeasure };
}

const TABLE_RESULT: QueryResult = {
  columns: [
    { name: "File", type: "link" },
    { name: "Status", type: "text" },
  ],
  rows: [
    [
      { type: "link", name: "Note A", path: "docs/note-a.md" },
      { type: "text", value: "Done" },
    ],
    [
      { type: "link", name: "Note B", path: "docs/note-b.md" },
      { type: "text", value: "WIP" },
    ],
  ],
  total: 2,
};

describe("DqlResultWidget layout notification", () => {
  beforeEach(() => clearQueryCache());
  it("calls requestMeasure after async result replaces the loading placeholder", async () => {
    const { view, requestMeasure } = mockView();
    const runQuery = vi.fn().mockResolvedValue(TABLE_RESULT);
    const widget = new DqlResultWidget(
      "TABLE FROM \"docs\"",
      runQuery,
      undefined,
    );

    const dom = widget.toDOM(view);

    // Starts as loading placeholder; the view must not be told to measure yet.
    expect(dom.innerHTML).toContain("cm-dql-loading");
    expect(requestMeasure).not.toHaveBeenCalled();

    await runQuery("TABLE FROM \"docs\"");

    // After the result lands the placeholder is replaced — and the editor must
    // re-measure so content below the block doesn't overlap.
    expect(dom.innerHTML).toContain("cm-dql-table");
    expect(dom.innerHTML).toContain("Note A");
    expect(requestMeasure).toHaveBeenCalled();
  });

  it("calls requestMeasure after an error replaces the loading placeholder", async () => {
    const { view, requestMeasure } = mockView();
    const runQuery = vi.fn().mockRejectedValue(new Error("boom"));
    const widget = new DqlResultWidget("TABLE FROM \"docs\"", runQuery, undefined);

    const dom = widget.toDOM(view);
    expect(dom.innerHTML).toContain("cm-dql-loading");

    await runQuery("TABLE FROM \"docs\"").catch(() => {});

    expect(dom.innerHTML).toContain("cm-dql-error");
    expect(requestMeasure).toHaveBeenCalled();
  });
});

describe("EmbedMediaWidget layout notification", () => {
  it("calls requestMeasure when a lazy image finishes loading", () => {
    const { view, requestMeasure } = mockView();
    const widget = new EmbedMediaWidget("asset.png", "asset.png");
    const dom = widget.toDOM(view);

    const img = dom.querySelector("img");
    expect(img).not.toBeNull();
    expect(requestMeasure).not.toHaveBeenCalled();

    img!.dispatchEvent(new Event("load"));
    expect(requestMeasure).toHaveBeenCalled();
  });
});

/**
 * Root-cause regression: a multi-line block widget (DQL fenced code block)
 * must be emitted as a CM *block* decoration (block: true) so it is drawn
 * between lines in its own block slot. With block: false the container's
 * block-level <div> is placed inline over a multi-line range and its height
 * overflows into — overlapping — the line below.
 */
describe("DQL block widget uses a block: true decoration (no overlap)", () => {
  function dqlState(): EditorState {
    const extensions: Extension[] = [
      markdown({
        base: markdownLanguage,
        extensions: [wikiLinkExtension, Table],
      }),
      livePreviewPlugin,
      blockWidgetSpecsFacet.of(dqlBlockSpec),
      runQueryFacet.of(async () => TABLE_RESULT),
    ];
    // Place the caret after the block so live preview renders it (cursor not
    // inside the fenced code), which is the state where the overlap occurs.
    return EditorState.create({
      doc: '```dql\nTABLE FROM "docs"\n```\n\nBelow text',
      selection: { anchor: '```dql\nTABLE FROM "docs"\n```\n\nBelow text'.length },
      extensions,
    });
  }

  it("emits the DQL replacement as a block: true decoration", () => {
    const state = dqlState();
    const field = state.field(livePreviewField, false);
    expect(field).toBeTruthy();

    let foundDql = false;
    field!.decorations.between(0, state.doc.length, (_f, _t, value) => {
      if ("widget" in value && value.widget instanceof DqlResultWidget) {
        foundDql = true;
        expect(value.spec.block).toBe(true);
      }
    });
    expect(foundDql).toBe(true);
  });
});
