/**
 * Diagnostic assertion helper: check a `DecorationReport` (see `dump-decos.ts`)
 * in a readable, failure-friendly way. Built on vitest `expect` so a mismatch
 * prints the full formatted report next to the offending assertion.
 *
 * Mirrors the "assertDecorations" diagnostic agreed for this suite — the
 * `dump*` helpers pour *and* the report double as test failure output.
 */
import { expect } from "vitest";
import {
  formatDecorationReport,
  type DecorationReport,
} from "./dump-decos";

export interface DecorationAssertions {
  toHaveLineClass(pos: number, cls: string): DecorationAssertions;
  toHaveLineClasses(entries: Array<[number, string]>): DecorationAssertions;
  toHaveMark(from: number, to: number, cls: string): DecorationAssertions;
  toHaveMarks(entries: Array<[number, number, string]>): DecorationAssertions;
  toHaveNoMark(from: number, to: number, cls: string): DecorationAssertions;
  toHaveReplace(
    from: number,
    to: number,
    widgetName: string,
  ): DecorationAssertions;
  /** Assert the report produced no decorations at all. */
  toHaveNoDecorations(): DecorationAssertions;
  // Free-form access for custom checks.
  readonly report: DecorationReport;
}

/**
 * Create a chainable assertion object over a decoration report. Every method
 * returns `this` so checks can be chained:
 *
 *   assertDecorations(report)
 *     .toHaveLineClass(0, "cm-live-heading-1")
 *     .toHaveMark(0, 1, "cm-live-hide");
 */
export function assertDecorations(report: DecorationReport): DecorationAssertions {
  const fmt = () => formatDecorationReport(report);

  function containEqual(arr: unknown[], expected: unknown, label: string) {
    expect(arr, `${label}\n${fmt()}`).toContainEqual(expected);
  }

  const api: DecorationAssertions = {
    report,
    toHaveLineClass(pos, cls) {
      containEqual(report.lineClasses, { pos, class: cls }, `lineClass ${cls}@${pos}`);
      return api;
    },
    toHaveLineClasses(entries) {
      for (const [pos, cls] of entries) {
        containEqual(report.lineClasses, { pos, class: cls }, `lineClass ${cls}@${pos}`);
      }
      return api;
    },
    toHaveMark(from, to, cls) {
      containEqual(report.marks, { from, to, class: cls }, `mark [${from}..${to}]=${cls}`);
      return api;
    },
    toHaveMarks(entries) {
      for (const [from, to, cls] of entries) {
        containEqual(report.marks, { from, to, class: cls }, `mark [${from}..${to}]=${cls}`);
      }
      return api;
    },
    toHaveNoMark(from, to, cls) {
      expect(
        report.marks.some((m) => m.from === from && m.to === to && m.class === cls),
        `unexpected mark [${from}..${to}]=${cls}\n${fmt()}`,
      ).toBe(false);
      return api;
    },
    toHaveReplace(from, to, widgetName) {
      containEqual(
        report.replaces,
        { from, to, widget: widgetName },
        `replace [${from}..${to}] as ${widgetName}`,
      );
      return api;
    },
    toHaveNoDecorations() {
      const empty =
        report.lineClasses.length === 0 &&
        report.marks.length === 0 &&
        report.replaces.length === 0;
      expect(empty, `expected no decorations, got:\n${fmt()}`).toBe(true);
      return api;
    },
  };

  return api;
}
