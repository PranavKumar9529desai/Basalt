import type { EditorState } from "@codemirror/state";
import type { WidgetType } from "@codemirror/view";

/**
 * Shared context passed to all decoration handlers during the single tree walk.
 * Created once per decoration build cycle and shared across all handlers.
 */
export interface DecorationContext {
  /** The currently focused line (null if editor not focused) */
  activeLine: { from: number; to: number; number: number } | null;
  /** Cursor head position */
  headPos: number;
  /** The editor state (doc, selection, facets) — never a view: builders must
   * be callable from StateField updates, where no view is available. */
  state: EditorState;
  /** Accumulated code block ranges (populated by code-blocks handler during the walk) */
  codeBlockRanges: { from: number; to: number }[];
}

/** Collected decoration ranges from all handlers, sorted later via Decoration.set(..., true) */
export interface DecorationCollector {
  addLineClass(pos: number, className: string): void;
  addMark(from: number, to: number, className: string): void;
  addReplace(
    from: number,
    to: number,
    widget: WidgetType,
    block?: boolean,
    atomic?: boolean,
  ): void;
  addPoint?(pos: number, widget: WidgetType): void;
}

/**
 * Check if a position falls inside any known code block range.
 *
 * Assumes ranges are sorted by `from` (ascending). Use `sortCodeBlockRanges`
 * to ensure ordering if the array was built out of document-order.
 */
export function isInCodeBlock(
  pos: number,
  ranges: { from: number; to: number }[],
): boolean {
  if (ranges.length === 0) return false;

  let lo = 0;
  let hi = ranges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid];
    if (pos < r.from) {
      hi = mid;
    } else if (pos > r.to) {
      lo = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

/** Cursor used for amortized O(1) monotonic code-block range resolution (ADR-040). */
export interface CodeBlockCursor {
  index: number;
}

/**
 * Check if a position falls inside any known code block range using a forward-advancing
 * monotonic cursor (ADR-040).
 *
 * When traversing in document order, `pos` is monotonically non-decreasing. The cursor
 * advances forward without backtracking, reducing containment checks from O(log N) to
 * amortized O(1).
 */
export function isInCodeBlockMonotonic(
  pos: number,
  ranges: { from: number; to: number }[],
  cursor: CodeBlockCursor,
): boolean {
  const len = ranges.length;
  if (len === 0) return false;

  let idx = cursor.index;
  // If pos went backwards due to non-sequential traversal, reset cursor
  if (idx > 0 && (idx >= len || pos < ranges[idx - 1].to)) {
    cursor.index = 0;
    idx = 0;
  }

  while (idx < len && ranges[idx].to < pos) {
    idx++;
  }
  cursor.index = idx;

  if (idx < len) {
    const r = ranges[idx];
    return pos >= r.from && pos <= r.to;
  }
  return false;
}

/** Sort an array of `{ from, to }` ranges in-place by `from` (ascending). */
export function sortCodeBlockRanges(
  ranges: { from: number; to: number }[],
): void {
  ranges.sort((a, b) => a.from - b.from);
}
