import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState, type FC } from "react";
import type { TagEntry } from "../types";
import { Button } from "@workspace/ui/components/ui/button";

interface TagsSidebarProps {
  /** Click a tag — opens search with `tag:<tag>`. */
  onOpenTag: (tag: string) => void;
}

/**
 * Right-dock Tags pane. Loads `get_tag_counts` (vault tags + per-tag note
 * counts, frontmatter and body) and renders a virtualized list sorted by
 * count descending. Rows are plain button pills styled like the editor's
 * `.cm-live-tag`, with the note count on the right.
 */
export const TagsSidebar: FC<TagsSidebarProps> = ({ onOpenTag }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [tags, setTags] = useState<TagEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<TagEntry[]>("get_tag_counts")
      .then((rows) => {
        if (!cancelled) setTags(rows);
      })
      .catch((err) => {
        console.error("[tags] get_tag_counts failed:", err);
        if (!cancelled) setError("Could not load tags.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: tags?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 10,
    paddingStart: 4,
    paddingEnd: 4,
  });

  const title = useMemo(
    () => (tags ? `${tags.length} tags` : undefined),
    [tags],
  );

  return (
    <div className="flex flex-col h-full bg-[var(--sat-surface-2)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--sat-layout-border)] shrink-0">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="text-[var(--sat-text-muted)] shrink-0"
        >
          <path
            d="M13 2 3 14a2 2 0 0 0 0 3l4 4a2 2 0 0 0 3 0L21 9a3 3 0 0 0 1-2V4a2 2 0 0 0-2-2h-7Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="15" cy="8" r="1.5" fill="currentColor" stroke="none" />
        </svg>
        <span className="text-xs font-semibold text-[var(--sat-text-primary)] uppercase tracking-wide">
          Tags
        </span>
        {title && (
          <span className="ml-auto text-xs text-[var(--sat-text-muted)] tabular-nums">
            {title}
          </span>
        )}
      </div>

      {/* List */}
      <div ref={parentRef} className="flex-1 overflow-auto py-1">
        {error ? (
          <p className="px-4 py-3 text-xs text-[var(--sat-state-danger)]">
            {error}
          </p>
        ) : tags === null ? (
          <p className="px-4 py-3 text-xs text-[var(--sat-text-muted)]">
            Loading…
          </p>
        ) : tags.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
            <p className="text-xs text-[var(--sat-text-muted)] text-center">
              No tags yet. Tag a note with{" "}
              <code className="text-[var(--sat-text-secondary)]">#tag</code>.
            </p>
          </div>
        ) : (
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((vItem) => {
              const entry = tags[vItem.index];
              return (
                <div
                  key={entry.tag}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vItem.start}px)`,
                  }}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => onOpenTag(entry.tag)}
                    title={`Show notes tagged #${entry.tag}`}
                    className="w-full justify-start gap-2 px-3 py-0.5"
                  >
                    <span
                      className="
                        inline-block truncate max-w-full
                        text-xs leading-6 px-2.5 rounded-full
                        bg-[var(--sat-tag-bg, rgba(99,102,241,0.15))]
                        text-[var(--sat-tag-color, #818cf8)]
                        transition-colors
                      "
                    >
                      #{entry.tag}
                    </span>
                    <span className="ml-auto text-xs text-[var(--sat-text-muted)] tabular-nums shrink-0">
                      {entry.count}
                    </span>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
