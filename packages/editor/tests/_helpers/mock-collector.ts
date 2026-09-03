/**
 * Test helper: an in-memory `DecorationCollector` that records every
 * addLineClass / addMark / addReplace call. Lets handler tests assert on the
 * exact decoration calls without building a real DecorationSet (which needs
 * `@codemirror/view`'s DOM types).
 *
 * Mirrors the same interface as `DecorationCollector` from `preview/types`.
 */

export interface RecordingCollector {
  lines: { pos: number; className: string }[];
  marks: { from: number; to: number; className: string }[];
  replaces: {
    from: number;
    to: number;
    widget: unknown;
    block?: boolean;
    atomic?: boolean;
  }[];
  addLineClass(pos: number, className: string): void;
  addMark(from: number, to: number, className: string): void;
  addReplace(
    from: number,
    to: number,
    widget: unknown,
    block?: boolean,
    atomic?: boolean,
  ): void;
  /** True if any calls were recorded. */
  get empty(): boolean;
  /** Reset all recorded entries (e.g. between phases of one test). */
  reset(): void;
}

/**
 * Generic in-memory collector that satisfies `DecorationCollector` for any
 * handler test. Widgets are captured as-is (the widget instance). Use
 * `WidgetType.equals` or check `constructor.name` to assert on them.
 */
export function makeCollector(): RecordingCollector {
  const lines: RecordingCollector["lines"] = [];
  const marks: RecordingCollector["marks"] = [];
  const replaces: RecordingCollector["replaces"] = [];

  return {
    lines,
    marks,
    replaces,
    addLineClass(pos, className) {
      lines.push({ pos, className });
    },
    addMark(from, to, className) {
      marks.push({ from, to, className });
    },
    addReplace(from, to, widget, block = false, atomic = false) {
      replaces.push({ from, to, widget, block, atomic });
    },
    get empty() {
      return lines.length === 0 && marks.length === 0 && replaces.length === 0;
    },
    reset() {
      lines.length = 0;
      marks.length = 0;
      replaces.length = 0;
    },
  };
}
