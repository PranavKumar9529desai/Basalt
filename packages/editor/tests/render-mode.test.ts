/**
 * Reading mode (renderMode === "reading") must fully render — never reveal raw
 * markdown syntax on the caret line. This guards the ADR-029 single-renderer
 * regression where the shared live-preview engine kept revealing `# Heading`
 * (and kept tables/DQL raw) because the caret still exists in reading mode.
 *
 * Edit mode (default renderMode "live") must keep the WYSIWYM cursor-reveal.
 */
import { describe, expect, it } from "vitest";
import { EditorState, type Extension } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Table } from "@lezer/markdown";
import {
  livePreviewField,
  livePreviewPlugin,
} from "../src/preview/live-preview";
import { renderModeReading } from "../src/preview/render-mode";
import { blockWidgetSpecsFacet } from "../src/block-widgets/registry";
import { tableBlockSpec } from "../src/block-widgets/table-widget";
import { dqlBlockSpec } from "../src/block-widgets/dql-widget";
import { wikiLinkExtension } from "../src/syntax/wiki-links";

function stateFor(
  doc: string,
  mode?: Extension,
): { state: EditorState; doc: string } {
  const extensions: Extension[] = [
    markdown({
      base: markdownLanguage,
      extensions: [wikiLinkExtension, Table],
    }),
    livePreviewPlugin,
    blockWidgetSpecsFacet.of(tableBlockSpec),
    blockWidgetSpecsFacet.of(dqlBlockSpec),
  ];
  if (mode) extensions.push(mode);
  const state = EditorState.create({
    doc,
    extensions,
  });
  return { state, doc };
}

/** Collect the constructor names of all block-widget replace decorations. */
function widgetNames(state: EditorState): string[] {
  const field = state.field(livePreviewField, false);
  if (!field) return [];
  const out: string[] = [];
  field.decorations.between(0, state.doc.length, (_f, _t, value) => {
    if ("widget" in value && value.widget) {
      out.push((value.widget.constructor as { name: string }).name);
    }
  });
  return out;
}

/** Collect inline mark decoration classes that cover the given range. */
function marksIn(state: EditorState, from: number, to: number): string[] {
  const field = state.field(livePreviewField, false);
  if (!field) return [];
  const out: string[] = [];
  field.decorations.between(from, to, (_f, _t, value) => {
    if (value.spec.class) out.push(String(value.spec.class));
  });
  return out;
}

describe("reading mode fully renders (renderMode facet)", () => {
  it("hides the heading marker even with the caret on the heading", () => {
    // Caret at index 0 = right on "# Heading"
    const { state } = stateFor("# Heading\n", renderModeReading);
    // "#" occupies doc positions 0..1
    const classes = marksIn(state, 0, 1);
    // cm-live-hide means the raw marker is hidden (fully rendered).
    expect(classes).toContain("cm-live-hide");
  });

  it("renders a table widget with the caret inside the table (reading mode)", () => {
    const table = "| A | B |\n|---|---|\n| 1 | 2 |";
    // Caret at index 0 sits inside the table's first line.
    const { state } = stateFor(table, renderModeReading);
    expect(widgetNames(state)).toContain("TableBlockWidget");
  });

  it("renders a DQL result widget with the caret inside the block (reading mode)", () => {
    const dql = "```dql\nTABLE FROM \"docs\"\n```";
    // Caret at index 0 sits inside the dql fenced code block.
    const { state } = stateFor(dql, renderModeReading);
    expect(widgetNames(state)).toContain("DqlResultWidget");
  });
});

describe("live preview keeps cursor-reveal (renderMode 'live')", () => {
  it("reveals the heading marker when the caret is on the heading", () => {
    const { state } = stateFor("# Heading\n");
    const classes = marksIn(state, 0, 1);
    expect(classes).toContain("cm-live-block-mark");
    expect(classes).not.toContain("cm-live-hide");
  });

  it("keeps the table raw with the caret inside it (live preview)", () => {
    const table = "| A | B |\n|---|---|\n| 1 | 2 |";
    const { state } = stateFor(table);
    // Caret inside → raw source, no rich widget.
    expect(widgetNames(state)).not.toContain("TableBlockWidget");
  });

  it("keeps the DQL block raw with the caret inside it (live preview)", () => {
    const dql = "```dql\nTABLE FROM \"docs\"\n```";
    const { state } = stateFor(dql);
    expect(widgetNames(state)).not.toContain("DqlResultWidget");
  });
});
