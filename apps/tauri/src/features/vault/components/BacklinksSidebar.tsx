import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState, type FC } from "react";
import type { BacklinkEntry } from "../types";
import { Button } from "@workspace/ui/components/ui/button";

interface BacklinksSidebarProps {
  /** Notes that link to the active note, each with its mention lines. */
  backlinks: BacklinkEntry[];
  /** Open a backlinking note, optionally jumping to a mention line. */
  onOpenNote: (path: string, line?: number) => void;
}

/**
 * Right-dock backlinks panel. Mirrors Obsidian's shape: one row per
 * backlinking note, with each mention's excerpt below it. Entries that link
 * only via frontmatter (graph edges with no prose mentions) render a muted
 * hint instead of excerpts. List is virtualized; mentions per entry are
 * capped at 5 by the Rust side, so they render flat.
 */
export const BacklinksSidebar: FC<BacklinksSidebarProps> = ({
  backlinks,
  onOpenNote,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? backlinks.filter((e) => e.name.toLowerCase().includes(q))
      : backlinks;
  }, [backlinks, filter]);

  // An entry's height: heading (~28px) + one 26px row per mention + padding.
  const estimateSize = (index: number) =>
    30 + Math.max(1, filtered[index].mentions.length) * 26 + 6;

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 6,
    paddingStart: 4,
    paddingEnd: 4,
  });

  return (
    <div className="flex flex-col h-full bg-[var(--sat-surface-2)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--sat-layout-border)] shrink-0">
        {/* Link icon */}
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="text-[var(--sat-text-muted)] shrink-0"
        >
          <path
            d="M6.5 9.5a3.536 3.536 0 0 0 5 0l2-2a3.536 3.536 0 0 0-5-5L7.5 3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d="M9.5 6.5a3.536 3.536 0 0 0-5 0l-2 2a3.536 3.536 0 0 0 5 5l1-1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-xs font-semibold text-[var(--sat-text-primary)] uppercase tracking-wide">
          Backlinks
        </span>
        {backlinks.length > 0 && (
          <span className="ml-auto text-xs text-[var(--sat-text-muted)] tabular-nums">
            {backlinks.length}
          </span>
        )}
        {backlinks.length > 1 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter"
            aria-label="Filter backlinks"
            className="
              w-24 text-xs px-2 py-1 rounded
              bg-[var(--sat-surface-1)]
              text-[var(--sat-text-primary)]
              placeholder:text-[var(--sat-text-muted)]
              border border-[var(--sat-layout-border)]
              focus:outline-none focus:border-[var(--sat-accent-primary)]
            "
          />
        )}
      </div>

      {/* List */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto py-1"
        data-testid="backlinks-list"
      >
        {backlinks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="text-[var(--sat-text-muted)]"
            >
              <path
                d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-xs text-[var(--sat-text-muted)] text-center">
              No notes link here yet.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-3 text-xs text-[var(--sat-text-muted)]">
            No matches for “{filter}”.
          </p>
        ) : (
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((vItem) => {
              const entry = filtered[vItem.index];
              return (
                <div
                  key={entry.path}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vItem.start}px)`,
                  }}
                >
                  <div className="px-3 pb-1.5">
                    {/* Note heading — opens the note itself */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => onOpenNote(entry.path)}
                      title={entry.path}
                      className="w-full justify-start gap-2 py-0.5 text-sm text-[var(--sat-text-primary)] hover:text-[var(--sat-accent-primary)]"
                    >
                      <span className="truncate">{entry.name}</span>
                      <span className="text-[10px] font-normal text-[var(--sat-text-muted)] tabular-nums shrink-0">
                        {entry.mentions.length}
                      </span>
                    </Button>

                    {entry.mentions.length === 0 ? (
                      <p className="pl-1 text-[11px] italic text-[var(--sat-text-muted)] leading-5">
                        Linked in frontmatter
                      </p>
                    ) : (
                      <ul>
                        {entry.mentions.map((m) => (
                          <li key={m.line}>
                            <Button
                              type="button"
                              variant="sat-ghost"
                              size="xs"
                              onClick={() => onOpenNote(entry.path, m.line)}
                              title={`Line ${m.line}`}
                              className="w-full justify-start truncate leading-6 px-1.5"
                            >
                              {m.excerpt}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
