import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";
import { isInCodeBlock } from "./types";

export const HEADING_CLASS: Record<string, string> = {
  ATXHeading1: "cm-live-heading-1",
  ATXHeading2: "cm-live-heading-2",
  ATXHeading3: "cm-live-heading-3",
  ATXHeading4: "cm-live-heading-4",
  ATXHeading5: "cm-live-heading-5",
  ATXHeading6: "cm-live-heading-6",
  ATXHeading7: "cm-live-heading-7",
  SetextHeading1: "cm-live-heading-1",
  SetextHeading2: "cm-live-heading-2",
};

export const HEADING_7_RE = /^(\s{0,3}#{7}\s+)/;

/**
 * Handles ATXHeading / SetextHeading nodes — adds line-level heading classes.
 * Returns true if the node was handled (caller can skip descending).
 */
export function handleHeadingNode(
  node: SyntaxNodeRef,
  ctx: DecorationContext,
  collector: DecorationCollector,
): boolean {
  const headingClass = HEADING_CLASS[node.type.name];
  if (headingClass) {
    const line = ctx.state.doc.lineAt(node.from);
    collector.addLineClass(line.from, headingClass);
    return true;
  }
  return false;
}

/**
 * Scans visible lines for 7-hash headings (not supported by Lezer grammar).
 * Must be called AFTER the shared tree walk so codeBlockRanges are populated.
 */
export function handleHeading7Lines(
  rangeFrom: number,
  rangeTo: number,
  ctx: DecorationContext,
  collector: DecorationCollector,
): void {
  const { state, activeLine, codeBlockRanges } = ctx;
  const startLine = state.doc.lineAt(rangeFrom);
  const endLine = state.doc.lineAt(rangeTo);

  for (
    let lineNumber = startLine.number;
    lineNumber <= endLine.number;
    lineNumber += 1
  ) {
    const line = state.doc.line(lineNumber);
    const match = HEADING_7_RE.exec(line.text);
    if (!match || isInCodeBlock(line.from, codeBlockRanges)) {
      continue;
    }

    collector.addLineClass(line.from, "cm-live-heading-7");

    if (!activeLine || lineNumber !== activeLine.number) {
      const markerStart = line.from;
      const markerEnd = markerStart + match[1].length;
      collector.addMark(markerStart, markerEnd, "cm-live-hide");
    }
  }
}
