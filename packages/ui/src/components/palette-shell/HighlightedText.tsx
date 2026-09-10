import { useMemo, type ReactNode } from "react";

/**
 * Emphasizes the fuzzy-matched characters of `query` inside `text` with the
 * CommandPalette hit styling (color + underline).
 *
 * By default matching is a greedy left-to-right subsequence, case-insensitive.
 * A contiguous substring match renders the identical single span a plain
 * `indexOf` highlight would; non-contiguous fuzzy matches still get
 * per-character emphasis, so every matched row stays annotated. When `indices`
 * are provided (nucleo's optimal Smith-Waterman alignment from `search_files`),
 * they supersede the subsequence fallback — the highlight then shows exactly
 * what the scorer matched.
 */
export interface HighlightedTextProps {
  text: string;
  /** Characters to emphasize. Empty/whitespace → plain text. */
  query?: string;
  /**
   * Optimal-alignment match positions (UTF-8 byte offsets into `text`,
   * ascending + unique). When present, used verbatim instead of the greedy
   * subsequence of `query`.
   */
  indices?: readonly number[];
}

/**
 * Maps UTF-8 byte offsets (nucleo `search_files` indices) to UTF-16 code-unit
 * offsets — JS string slicing is code-unit based. Offsets that land mid-
 * character are skipped (nucleo only emits character boundaries, so this is
 * a no-op for ASCII). Output preserves ascending order.
 */
function byteOffsetsToUnitOffsets(
  text: string,
  byteOffsets: readonly number[],
): number[] {
  const unitByByte: number[] = [];
  let bytes = 0;
  for (let unit = 0; unit < text.length;) {
    const cp = text.codePointAt(unit) ?? 0;
    unitByByte[bytes] = unit;
    bytes += cp > 0xffff ? 4 : cp > 0x7f ? 2 : 1;
    unit += cp > 0xffff ? 2 : 1;
  }
  const hits: number[] = [];
  for (const b of byteOffsets) {
    const unit = unitByByte[b];
    if (unit !== undefined) hits.push(unit);
  }
  return hits;
}

/** Leftmost greedy subsequence indices of `query` in `text`, or null. */
function matchIndices(text: string, query: string): number[] | null {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (!lowerQuery) return null;
  const indices: number[] = [];
  let from = 0;
  for (const ch of lowerQuery) {
    const idx = lowerText.indexOf(ch, from);
    if (idx === -1) return null;
    indices.push(idx);
    from = idx + 1;
  }
  return indices;
}

export function HighlightedText({
  text,
  query,
  indices,
}: HighlightedTextProps) {
  const hits = useMemo(() => {
    if (indices && indices.length > 0) {
      return byteOffsetsToUnitOffsets(text, indices);
    }
    return query ? matchIndices(text, query) : null;
  }, [text, query, indices]);

  if (!hits) return <span>{text}</span>;

  // Split `text` into highlighted/plain runs. Hits ascend, so a walking
  // pointer marks them in one pass.
  const parts: ReactNode[] = [];
  let run = "";
  let inHit = false;
  let k = 0;
  const flush = () => {
    if (!run) return;
    if (inHit) {
      parts.push(
        <span
          key={parts.length}
          className="text-foreground font-bold underline underline-offset-2"
        >
          {run}
        </span>,
      );
    } else {
      parts.push(run);
    }
    run = "";
  };
  for (let i = 0; i < text.length; i++) {
    const isHit = hits[k] === i;
    if (isHit) k += 1;
    if (isHit !== inHit) {
      flush();
      inHit = isHit;
    }
    run += text[i];
  }
  flush();
  return <span>{parts}</span>;
}
