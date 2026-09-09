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
 * When candidateLines is provided (ADR-040), only those candidate line numbers
 * are checked, bypassing the full-document scan.
 */
export function handleHeading7Lines(
  rangeFrom: number,
  rangeTo: number,
  ctx: DecorationContext,
  collector: DecorationCollector,
  candidateLines?: readonly number[],
): void {
  const { state, activeLine, codeBlockRanges } = ctx;
  if (state.doc.length === 0) return;

  if (candidateLines !== undefined) {
    if (candidateLines.length === 0) return;
    for (const lineNum of candidateLines) {
      if (lineNum < 1 || lineNum > state.doc.lines) continue;
      const line = state.doc.line(lineNum);
      if (line.from < rangeFrom || line.to > rangeTo) continue;
      const text = line.text;
      if (text.includes("#######")) {
        const match = HEADING_7_RE.exec(text);
        if (match && !isInCodeBlock(line.from, codeBlockRanges)) {
          collector.addLineClass(line.from, "cm-live-heading-7");

          if (!activeLine || line.number !== activeLine.number) {
            const markerStart = line.from;
            const markerEnd = markerStart + match[1].length;
            collector.addMark(markerStart, markerEnd, "cm-live-hide");
          }
        }
      }
    }
    return;
  }

  const startLine = state.doc.lineAt(rangeFrom);
  const endLine = state.doc.lineAt(Math.min(rangeTo, state.doc.length));

  let line = startLine;
  while (line.number <= endLine.number) {
    const text = line.text;
    // Fast skip: 7-hash headings must contain at least 7 consecutive '#' characters
    if (text.includes("#######")) {
      const match = HEADING_7_RE.exec(text);
      if (match && !isInCodeBlock(line.from, codeBlockRanges)) {
        collector.addLineClass(line.from, "cm-live-heading-7");

        if (!activeLine || line.number !== activeLine.number) {
          const markerStart = line.from;
          const markerEnd = markerStart + match[1].length;
          collector.addMark(markerStart, markerEnd, "cm-live-hide");
        }
      }
    }

    if (line.number >= endLine.number || line.to >= state.doc.length) break;
    line = state.doc.lineAt(line.to + 1);
  }
}
