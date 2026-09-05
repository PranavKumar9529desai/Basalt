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
import type { DecorationSet } from "@codemirror/view";
import { registerBlockWidget, tableBlockSpec } from "../../src";
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
    const widget = (deco as { widget?: { toDOM?: () => HTMLElement } }).widget;
    if (widget?.toDOM && widget.constructor.name === "TableBlockWidget") {
      found = widget.toDOM();
    }
  });
  return found;
}

const RESOLVABLE = new Set([
  "photo.png",
  "narration.mp3",
  "clip.mp4",
]);

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

  it("shows the rich table outside the caret but raw source inside (live preview)", () => {
    const doc = "| Asset |\n|---|\n| ![[photo.png]] |\n\nplain";
    const outside = doc.indexOf("plain"); // caret in trailing paragraph
    expect(tableWidgetHtml(liveTableFixture(doc, outside))).not.toBeNull();
    expect(tableWidgetHtml(liveTableFixture(doc, 6))).toBeNull();
  });
});