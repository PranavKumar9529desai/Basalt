/**
 * Pure word/char stats for the editor status line.
 *
 * Extracted from EditorView so the computation is unit-testable and
 * TypedArray/whitespace edge cases are pinned. `words` counts runs of
 * non-whitespace — the same rule the old inline split used, so a doc of only
 * whitespace reports 0 words, never 1.
 */
export function computeStats(text: string): { chars: number; words: number } {
  const trimmed = text.trim();
  return {
    chars: text.length,
    words: trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length,
  };
}