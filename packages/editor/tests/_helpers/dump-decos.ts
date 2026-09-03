/**
 * Diagnostic helper: inspect the `livePreviewField` (PreviewState) decoration
 * output produced by the single-pass decoration engine. Reads the value of the
 * StateField directly off an EditorState — no EditorView required.
 *
 * `dumpDecorations(state)` returns a structured, serializable report:
 *
 *   {
 *     lineClasses: [{ pos, class }],
 *     marks:       [{ from, to, class }],
 *     replaces:    [{ from, to, widget }],   // widget = constructor name
 *     atomicRanges:[{ from, to, widget }],
 *     codeBlockRanges: [{ from, to }],
 *     widgetModels: { id: count },           // block-widget model counts
 *     complete: boolean,
 *   }
 *
 * It also distinguishes decoration kind (line vs mark vs replace). `widget`
 * is the WidgetType subclass name, so you can see e.g. "FrontmatterWidget".
 */

import type { EditorState } from "@codemirror/state";
import type { Decoration, DecorationSet } from "@codemirror/view";
import { livePreviewField } from "../../src/preview/live-preview";

export interface DecorationReport {
  lineClasses: { pos: number; class: string }[];
  marks: { from: number; to: number; class: string }[];
  replaces: { from: number; to: number; widget: string }[];
  atomicRanges: { from: number; to: number; widget: string }[];
  codeBlockRanges: { from: number; to: number }[];
  widgetModels: Record<string, number>;
  complete: boolean;
}

/** The shape stored in the `livePreviewField` (PreviewState). */
interface PreviewStateValue {
  decorations: DecorationSet;
  atomicRanges: DecorationSet;
  codeBlockRanges: { from: number; to: number }[];
  widgetModels: Record<string, unknown[]>;
  complete: boolean;
}

/** Collect `[from, to, value]` triples from a DecorationSet into a report,
 * classifying each decoration by its actual kind via the constructor name
 * (LineDecoration / MarkDecoration / Widget+PointDecoration). */
function collect(set: DecorationSet, out: DecorationReport) {
  set.between(0, 1e9, (from, to, deco: Decoration) => {
    const spec = deco.spec as { class?: string };
    const kind = (deco as { constructor: { name: string } }).constructor.name;
    const cls = spec.class ?? "";
    if (kind === "LineDecoration") {
      out.lineClasses.push({ pos: from, class: cls });
    } else if (kind === "MarkDecoration") {
      out.marks.push({ from, to, class: cls });
    } else {
      // WidgetDecoration / PointDecoration — the replaced block/inline widgets
      out.replaces.push({
        from,
        to,
        widget: (deco as { widget?: { constructor: { name: string } } }).widget
          ?.constructor?.name ?? "unknown",
      });
    }
  });
}

/**
 * Read the `livePreviewField` value from a state and flatten it into a
 * serializable report. Throws if the field isn't in the state (i.e. the
 * `livePreviewPlugin` extension wasn't included).
 */
export function dumpDecorations(state: EditorState): DecorationReport {
  const preview = state.field(livePreviewField) as PreviewStateValue;
  const report: DecorationReport = {
    lineClasses: [],
    marks: [],
    replaces: [],
    atomicRanges: [],
    codeBlockRanges: preview.codeBlockRanges,
    widgetModels: Object.fromEntries(
      Object.entries(preview.widgetModels).map(([k, v]) => [k, v.length]),
    ),
    complete: preview.complete,
  };

  collect(preview.decorations, report);
  collect(preview.atomicRanges, report);

  return report;
}

/**
 * Small, terminal-friendly rendering of the report. Handy for attaching to a
 * failed assertion or printing in a debugger.
 */
export function formatDecorationReport(r: DecorationReport): string {
  const parts: string[] = [];
  if (r.lineClasses.length)
    parts.push(
      `lines: ${r.lineClasses
        .map((x) => `${x.pos}=${x.class}`)
        .join(", ")}`,
    );
  if (r.marks.length)
    parts.push(
      `marks: ${r.marks
        .map((x) => `[${x.from}..${x.to}]=${x.class}`)
        .join(", ")}`,
    );
  if (r.replaces.length)
    parts.push(
      `replaces: ${r.replaces
        .map((x) => `[${x.from}..${x.to}]${x.widget}`)
        .join(", ")}`,
    );
  if (r.codeBlockRanges.length)
    parts.push(
      `codeBlocks: ${r.codeBlockRanges
        .map((x) => `[${x.from}..${x.to}]`)
        .join(", ")}`,
    );
  parts.push(`complete=${r.complete}`);
  return parts.join(" | ");
}
