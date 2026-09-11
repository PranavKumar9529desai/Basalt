//! Match-window slicing. The search preview feeds an *entire* file into
//! CodeMirror, which parses and decorates the whole doc synchronously on the
//! WebCore main thread — O(doc) work on every result navigation, and past
//! WebKitGTK's 10s watchdog the web process aborts (`crashAfter10Seconds`).
//! `windowPreview` caps the parse to a few hundred lines around the match.

import type { Highlight } from "../../types";

export interface PreviewWindow {
  text: string;
  matchLine: number;
  highlights: Highlight[];
}

export const PREVIEW_WINDOW_LINES_BEFORE = 200;
export const PREVIEW_WINDOW_LINES_AFTER = 200;

/**
 * Slice `text` to a window of lines around the match. The match line's
 * *content* is unchanged by the slice, so line-relative highlight offsets
 * stay valid; only the line number shifts.
 */
export function windowPreview(
  text: string,
  matchLine: number,
  highlights: Highlight[],
): PreviewWindow {
  const beforeLine = Math.max(1, matchLine - PREVIEW_WINDOW_LINES_BEFORE);
  const afterLine = matchLine + PREVIEW_WINDOW_LINES_AFTER;
  let line = 1;
  let lineStart = 0;
  let start = 0;
  let end = text.length;
  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && text.charCodeAt(i) !== 10) continue;
    if (line === beforeLine) start = lineStart;
    if (line === afterLine) {
      end = i;
      break;
    }
    lineStart = i + 1;
    line += 1;
  }
  const newMatchLine = matchLine - beforeLine + 1;
  return { text: text.slice(start, end), matchLine: newMatchLine, highlights };
}