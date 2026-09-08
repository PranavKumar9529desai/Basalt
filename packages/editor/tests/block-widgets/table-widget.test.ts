/**
 * Part B — table-cell embeds render real media (ADR-034).
 *
 * The table block widget (`block-widgets/table-widget.ts`) replaces a markdown
 * table with rich <table> HTML. A `![[target]]` cell without an alias renders
 * an <img>/<video>/<audio> element when `resolveAsset` resolves the target to a
 * media file; everything else stays a clickable `.cm-table-link` carrying
 * `data-name` (consumed by the reading-mode click handler).
 *
 * Note on aliases: `![[x|y]]` is not testable at the widget level — `|` is a
 * pipe-table column separator even inside `[[…]]`, so the naive cell split
 * never hands the widget a complete wikilink. (Real embed READMEs rely on the
 * non-table embed paths for aliases.)
 */
import { describe, expect, it } from "vitest";
import type { EditorState } from "@codemirror/state";
import { EditorView, type DecorationSet } from "@codemirror/view";
import {
  registerBlockWidget,
  tableBlockSpec,
  setTableRawMode,
  tableRawModeField,
} from "../../src";
import { livePreviewField } from "../../src/preview/live-preview";
import { resolveAssetFacet } from "../../src/types";
import { testMarkdownFixture } from "../_helpers/test-fixture";

/** Grab the first TableBlockWidget instance's rendered DOM, or null. */
function tableWidgetHtml(state: EditorState): HTMLElement | null {
  const preview = state.field(livePreviewField) as {
    decorations: DecorationSet;
  };
  let found: HTMLElement | null = null;
  preview.decorations.between(0, state.doc.length, (_from, _to, deco) => {
    const widget = (deco as { widget?: { toDOM?: (view?: EditorView) => HTMLElement } }).widget;
    if (widget?.toDOM && widget.constructor.name === "TableBlockWidget") {
      const mockView = new EditorView({ state });
      found = widget.toDOM(mockView);
    }
  });
  return found;
}

const RESOLVABLE = new Set(["photo.png", "narration.mp3", "clip.mp4"]);

const mediaResolve = resolveAssetFacet.of((target: string) =>
  RESOLVABLE.has(target) ? `asset:///vault/${target}` : null,
);

function tableFixture(doc: string, selection?: number): EditorState {
  return testMarkdownFixture(doc, {
    renderMode: "reading",
    extensions: [registerBlockWidget(tableBlockSpec), mediaResolve],
    selection,
  }).state;
}

function liveTableFixture(doc: string, selection?: number): EditorState {
  return testMarkdownFixture(doc, {
    renderMode: "live",
    extensions: [registerBlockWidget(tableBlockSpec), mediaResolve],
    selection,
  }).state;
}

describe("table block widget embeds (ADR-034 part B)", () => {
  it("renders a real <img> for a resolvable ![[…png]] cell", () => {
    const html = tableWidgetHtml(
      tableFixture("| Asset |\n|---|\n| ![[photo.png]] |"),
    );
    expect(html).not.toBeNull();
    const img = html!.querySelector("img.cm-table-media")!;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("asset:///vault/photo.png");
    expect(img.getAttribute("data-name")).toBe("photo.png");
  });

  it("renders audio and video controls for their kinds", () => {
    const html = tableWidgetHtml(
      tableFixture(
        "| Audio | Video |\n|---|---|\n| ![[narration.mp3]] | ![[clip.mp4]] |",
      ),
    );
    const audio = html!.querySelector("audio.cm-table-media")!;
    const video = html!.querySelector("video.cm-table-media")!;
    expect(audio).not.toBeNull();
    expect(audio.getAttribute("controls")).not.toBeNull();
    expect(video).not.toBeNull();
    expect(video.getAttribute("controls")).not.toBeNull();
  });

  it("keeps non-media and unresolvable embeds as links, never a broken <img>", () => {
    const html = tableWidgetHtml(
      tableFixture(
        "| Note | Text | Missing |\n|---|---|---|\n| ![[notes/other]] | ![[readme.txt]] | ![[ghost.png]] |",
      ),
    );
    const links = html!.querySelectorAll(".cm-table-link");
    expect(html!.querySelector("img.cm-table-media")).toBeNull();
    expect(links).toHaveLength(3);
    expect(links[0].textContent).toBe("notes/other");
    expect(links[0].getAttribute("data-name")).toBe("notes/other");
    // .txt → resolve null → link, not a broken media tag.
    expect(links[1].getAttribute("data-name")).toBe("readme.txt");
    // Unresolvable media target → link (no broken <img> for ghost.png).
    expect(links[2].getAttribute("data-name")).toBe("ghost.png");
  });

  it("carries data-name on plain wikilinks for the reading click handler", () => {
    const html = tableWidgetHtml(tableFixture("| Note |\n|---|\n| [[Rust]] |"));
    const link = html!.querySelector(".cm-table-link")!;
    expect(link).not.toBeNull();
    expect(link.getAttribute("data-name")).toBe("Rust");
    expect(html!.querySelector("img, video, audio")).toBeNull();
  });

  it("keeps the rich table rendered inside the caret with interactive controls (live preview)", () => {
    const doc = "| Asset |\n|---|\n| ![[photo.png]] |\n\nplain";
    const liveHtml = tableWidgetHtml(liveTableFixture(doc, 6)); // caret inside table
    expect(liveHtml).not.toBeNull();
    // Live preview includes code toggle button and add col/row buttons
    expect(liveHtml!.querySelector(".cm-table-btn-code")).not.toBeNull();
    expect(liveHtml!.querySelector(".cm-table-add-col-btn")).not.toBeNull();
    expect(liveHtml!.querySelector(".cm-table-add-row-btn")).not.toBeNull();
    // Cells in live preview have contenteditable enabled
    const th = liveHtml!.querySelector("th")!;
    expect(th.getAttribute("contenteditable")).toBe("plaintext-only");
  });

  it("renders clean read-only table without edit chrome in reading mode", () => {
    const doc = "| Asset |\n|---|\n| ![[photo.png]] |";
    const readingHtml = tableWidgetHtml(tableFixture(doc));
    expect(readingHtml).not.toBeNull();
    expect(readingHtml!.querySelector(".cm-table-btn-code")).toBeNull();
    expect(readingHtml!.querySelector(".cm-table-add-col-btn")).toBeNull();
    expect(readingHtml!.querySelector(".cm-table-add-row-btn")).toBeNull();
    const th = readingHtml!.querySelector("th")!;
    expect(th.getAttribute("contenteditable")).toBeNull();
  });

  it("collapses to raw source when setTableRawMode is dispatched, and restores when cursor moves outside", () => {
    const doc = "| Asset |\n|---|\n| ![[photo.png]] |\n\nplain";
    let state = liveTableFixture(doc, 6);
    expect(tableWidgetHtml(state)).not.toBeNull();

    // Toggle raw mode for table spanning [0, 27]
    state = state.update({
      effects: setTableRawMode.of({ from: 0, to: 27 }),
    }).state;
    expect(tableWidgetHtml(state)).toBeNull();

    // Move selection outside the table
    const outside = doc.indexOf("plain");
    state = state.update({
      selection: { anchor: outside },
    }).state;
    expect(tableWidgetHtml(state)).not.toBeNull();
  });

  it("renders ghost cells and reveals tooltip text ONLY when hovering the + buttons", () => {
    const doc = "| Product | Price |\n|---|---|\n| Laptop | $1000 |";
    const liveHtml = tableWidgetHtml(liveTableFixture(doc, 0));
    expect(liveHtml).not.toBeNull();

    // Ghost column and ghost row cells exist in grid
    expect(liveHtml!.querySelector(".cm-table-ghost-col-th")).not.toBeNull();
    expect(liveHtml!.querySelector(".cm-table-ghost-col-td")).not.toBeNull();
    expect(liveHtml!.querySelector(".cm-table-ghost-row")).not.toBeNull();

    const addColBtn = liveHtml!.querySelector(".cm-table-ghost-btn-col")!;
    const colLabel = liveHtml!.querySelector(".cm-table-ghost-label-col")!;
    const addRowBtn = liveHtml!.querySelector(".cm-table-ghost-btn-row")!;
    const rowLabel = liveHtml!.querySelector(".cm-table-ghost-label-row")!;

    expect(colLabel.textContent).toBe("Add column to the right");
    expect(rowLabel.textContent).toBe("Add row below");

    // Initially hidden (no visible class)
    expect(colLabel.classList.contains("visible")).toBe(false);
    expect(rowLabel.classList.contains("visible")).toBe(false);

    // Hovering + button reveals the text
    addColBtn.dispatchEvent(new MouseEvent("mouseenter"));
    expect(colLabel.classList.contains("visible")).toBe(true);

    addColBtn.dispatchEvent(new MouseEvent("mouseleave"));
    expect(colLabel.classList.contains("visible")).toBe(false);

    addRowBtn.dispatchEvent(new MouseEvent("mouseenter"));
    expect(rowLabel.classList.contains("visible")).toBe(true);

    addRowBtn.dispatchEvent(new MouseEvent("mouseleave"));
    expect(rowLabel.classList.contains("visible")).toBe(false);
  });

  it("anchors code button inside .cm-table-container and dispatches raw mode on click", () => {
    const doc = "| Product | Price |\n|---|---|\n| Laptop | $1000 |";
    const fixture = testMarkdownFixture(doc, {
      renderMode: "live",
      extensions: [registerBlockWidget(tableBlockSpec), mediaResolve],
    });
    const view = new EditorView({ state: fixture.state });
    const preview = fixture.state.field(livePreviewField) as {
      decorations: DecorationSet;
    };
    let widgetObj: { toDOM: (view?: any) => HTMLElement } | null = null;
    preview.decorations.between(
      0,
      fixture.state.doc.length,
      (_from, _to, deco) => {
        const w = (deco as any).widget;
        if (w?.constructor?.name === "TableBlockWidget") widgetObj = w;
      },
    );
    expect(widgetObj).not.toBeNull();
    const dom = widgetObj!.toDOM(view);

    const container = dom.querySelector(".cm-table-container")!;
    const codeBtn = container.querySelector(".cm-code-btn-toggle")!;
    expect(codeBtn).not.toBeNull();
    expect(codeBtn.parentElement).toBe(container);

    // Clicking code toggle dispatches setTableRawMode
    codeBtn.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    const rawRange = view.state.field(tableRawModeField, false);
    expect(rawRange).not.toBeNull();
    expect(rawRange!.from).toBe(0);
    expect(rawRange!.to).toBe(doc.length);
    view.destroy();
  });

  it("activates column and row hover zones independently (never showing both)", () => {
    const doc = "| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |";
    const liveHtml = tableWidgetHtml(liveTableFixture(doc, 0));
    expect(liveHtml).not.toBeNull();

    const container = liveHtml!.querySelector(".cm-table-container")!;
    expect(container.classList.contains("cm-zone-col-active")).toBe(false);
    expect(container.classList.contains("cm-zone-row-active")).toBe(false);

    // Hover over an interior cell (Row 1, Col 1) -> neither zone active
    const interiorCell = liveHtml!.querySelector(
      'td[data-row="1"][data-col="1"]',
    )!;
    container.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    interiorCell.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(container.classList.contains("cm-zone-col-active")).toBe(false);
    expect(container.classList.contains("cm-zone-row-active")).toBe(false);

    // Hover over last column cell (Row 1, Col 2) -> only col zone active
    const lastColCell = liveHtml!.querySelector(
      'td[data-row="1"][data-col="2"]',
    )!;
    lastColCell.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(container.classList.contains("cm-zone-col-active")).toBe(true);
    expect(container.classList.contains("cm-zone-row-active")).toBe(false);

    // Hover over last row cell (Row 2, Col 0) -> only row zone active
    const lastRowCell = liveHtml!.querySelector(
      'td[data-row="2"][data-col="0"]',
    )!;
    lastRowCell.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(container.classList.contains("cm-zone-col-active")).toBe(false);
    expect(container.classList.contains("cm-zone-row-active")).toBe(true);

    // Mouse leaves container -> both zones deactivated
    container.dispatchEvent(new MouseEvent("mouseleave"));
    expect(container.classList.contains("cm-zone-col-active")).toBe(false);
    expect(container.classList.contains("cm-zone-row-active")).toBe(false);
  });

  it("never triggers ghost column or ghost row when hovering over code toggle button or header cells", () => {
    const doc = "| Name | Price |\n|---|---|\n| Laptop | $1000 |";
    const liveHtml = tableWidgetHtml(liveTableFixture(doc, 0));
    expect(liveHtml).not.toBeNull();

    const container = liveHtml!.querySelector(".cm-table-container")!;
    const codeBtn = liveHtml!.querySelector(".cm-table-btn-code")!;
    const headerTh = liveHtml!.querySelector("th")!;

    // Hover over code toggle button
    codeBtn.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(container.classList.contains("cm-zone-col-active")).toBe(false);
    expect(container.classList.contains("cm-zone-row-active")).toBe(false);

    // Hover over header cell
    headerTh.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(container.classList.contains("cm-zone-col-active")).toBe(false);
    expect(container.classList.contains("cm-zone-row-active")).toBe(false);
  });
});
