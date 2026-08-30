import { IconFileText } from "@tabler/icons-react";
import { memo, type CSSProperties, type ReactNode } from "react";
import { Button } from "@workspace/ui/components/ui/button";

import type { FileMatch, Highlight, LineMatch } from "../types";

/** Renders `text` with `highlights` (character offsets) wrapped in <mark>. */
function HighlightedText({
  text,
  highlights,
  className,
}: {
  text: string;
  highlights: Highlight[];
  className?: string;
}) {
  if (highlights.length === 0) return <span className={className}>{text}</span>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  for (const h of sorted) {
    if (h.start > cursor) {
      parts.push(<span key={`t-${cursor}`}>{text.slice(cursor, h.start)}</span>);
    }
    parts.push(
      <mark
        key={`h-${h.start}`}
        className="bg-[var(--sat-accent-primary)] text-[var(--sat-text-inverse)] rounded-[2px] px-[1px] py-px"
      >
        {text.slice(h.start, h.end)}
      </mark>,
    );
    cursor = h.end;
  }
  if (cursor < text.length) {
    parts.push(<span key="t-end">{text.slice(cursor)}</span>);
  }
  return <span className={className}>{parts}</span>;
}

/** Absolute position for a virtualized row inside the grid's fixed container. */
function rowStyle(top: number): CSSProperties {
  return {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    transform: `translateY(${top}px)`,
  };
}

/**
 * File-group header row. Memoized on a `number` (top) so re-renders inside
 * the virtualized list skip it unless it actually moved.
 */
export const FileRow = memo(function FileRow({
  file,
  top,
}: {
  file: FileMatch;
  top: number;
}) {
  return (
    <div
      style={rowStyle(top)}
      className="flex items-center gap-2 px-4 py-2 bg-[var(--sat-surface-2)] border-b border-[var(--sat-layout-border)]"
    >
      <IconFileText className="size-3.5 shrink-0 text-[var(--sat-text-muted)]" />
      <span className="flex-1 text-[12px] font-semibold truncate">
        {file.title}
      </span>
      <span className="text-[10px] tabular-nums text-[var(--sat-text-muted)]">
        {file.matches.length}
      </span>
    </div>
  );
});

/**
 * One search match. Memoized on primitives (`top`, `selected`) plus stable
 * item refs and a stable `onOpen`, so a selection change re-renders only the
 * two rows whose `selected` flips — not the whole list.
 */
export const MatchRow = memo(function MatchRow({
  file,
  match,
  selected,
  top,
  onOpen,
}: {
  file: FileMatch;
  match: LineMatch;
  selected: boolean;
  top: number;
  onOpen: (path: string, line: number) => void;
}) {
  return (
    <Button
      style={rowStyle(top)}
      variant="ghost"
      tabIndex={-1}
      className={[
        "w-full flex-col items-start gap-0.5 px-4 py-2.5 h-auto rounded-none text-left",
        selected ? "bg-[var(--sat-surface-3)]" : "hover:bg-[var(--sat-surface-1)]",
      ].join(" ")}
      onClick={() => onOpen(file.path, match.lineNumber)}
    >
      <span className="text-[10px] text-[var(--sat-text-muted)] tabular-nums">
        {file.title} · Ln {match.lineNumber}
      </span>
      <HighlightedText
        text={match.text}
        highlights={match.highlights}
        className="text-[12px] leading-snug truncate w-full text-[var(--sat-text-primary)]"
      />
    </Button>
  );
});