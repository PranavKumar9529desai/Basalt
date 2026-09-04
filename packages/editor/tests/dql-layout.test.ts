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
import type { EditorView } from "@codemirror/view";
import { clearQueryCache, DqlResultWidget } from "../src/block-widgets/dql-widget";
import type { QueryResult } from "../src/block-widgets/dql-widget";
import { EmbedMediaWidget } from "../src/input/embed-media";

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
