import type { EditorView } from "@codemirror/view";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Notify CodeMirror that a widget's DOM has changed size (e.g. after async
 * content loads). CM caches widget heights internally; without this call the
 * document layout stays stale and content below the widget overlaps.
 *
 * Safe to call multiple times — CM deduplicates via its measurement queue.
 */
export function notifyViewOfSizeChange(
  _element: HTMLElement,
  view: EditorView,
): void {
  view.requestMeasure();
}
