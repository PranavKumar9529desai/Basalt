import { useMemo, type ReactNode } from "react";

/**
 * Emphasizes the fuzzy-matched characters of `query` inside `text` with the
 * CommandPalette hit styling (color + underline).
 *
 * Matching is a greedy left-to-right subsequence, case-insensitive. A
 * contiguous substring match renders the identical single span a plain
 * `indexOf` highlight would; non-contiguous fuzzy matches still get
 * per-character emphasis, so every matched row stays annotated.
 */
export interface HighlightedTextProps {
  text: string;
  /** Characters to emphasize. Empty/whitespace → plain text. */
  query?: string;
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

export function HighlightedText({ text, query }: HighlightedTextProps) {
  const indices = useMemo(
    () => (query ? matchIndices(text, query) : null),
    [text, query],
  );

  if (!indices) return <span>{text}</span>;

  // Split `text` into highlighted/plain runs. Indices ascend (greedy
  // subsequence), so a walking pointer marks the hits in one pass.
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
    const isHit = indices[k] === i;
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