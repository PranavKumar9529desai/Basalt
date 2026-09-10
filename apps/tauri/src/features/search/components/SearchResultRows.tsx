import { IconFileText } from "@tabler/icons-react";
import { HighlightedText } from "@workspace/ui/components/palette-shell";
import { memo, type CSSProperties } from "react";
import { Button } from "@workspace/ui/components/ui/button";

import type { FileMatch, LineMatch } from "../types";

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
  query,
}: {
  file: FileMatch;
  top: number;
  query: string;
}) {
  return (
    <div
      style={rowStyle(top)}
      role="presentation"
      className="flex items-center gap-2 px-4 py-2 bg-[var(--sat-surface-2)] border-b border-[var(--sat-layout-border)]"
    >
      <IconFileText className="size-3.5 shrink-0 text-[var(--sat-text-muted)]" />
      <span className="flex-1 truncate text-[11px] font-semibold text-[var(--sat-text-primary)]">
        <HighlightedText text={file.title} query={query} />
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
  optionId,
  query,
}: {
  file: FileMatch;
  match: LineMatch;
  selected: boolean;
  top: number;
  onOpen: (path: string, line: number) => void;
  optionId: string;
  query: string;
}) {
  return (
    <Button
      id={optionId}
      // Virtualized rows cannot use native <option> elements.
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="option"
      aria-selected={selected}
      variant="ghost"
      tabIndex={-1}
      className={[
        "w-full flex-col items-start gap-0.5 px-4 py-2 h-auto rounded-none text-left",
        selected
          ? "text-[var(--sat-accent-primary)]"
          : "hover:bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)]",
      ].join(" ")}
      style={{
        ...rowStyle(top),
        backgroundColor: selected
          ? "color-mix(in srgb, var(--sat-accent-primary) 12%, transparent)"
          : undefined,
      }}
      onClick={() => onOpen(file.path, match.lineNumber)}
    >
      <span
        className={`text-[9px] tabular-nums ${selected ? "opacity-70" : "text-[var(--sat-text-muted)]"}`}
      >
        Ln {match.lineNumber}
      </span>
      <span
        className={`w-full truncate text-[11px] leading-snug ${selected ? "" : "text-[var(--sat-text-primary)]"}`}
      >
        <HighlightedText text={match.text} query={query} />
      </span>
    </Button>
  );
});
