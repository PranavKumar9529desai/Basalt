import { Button } from "@workspace/ui/components/ui/button";
import { Dialog, DialogContent } from "@workspace/ui/components/ui/dialog";
import { PaletteShellFooter } from "@workspace/ui/components/palette-shell";
import { IconFileSearch, IconFileText, IconSearch } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useSearchStore } from "../store";
import { PreviewPane } from "./PreviewPane";
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

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  for (const h of sorted) {
    if (h.start > cursor) {
      parts.push(
        <span key={`t-${cursor}`}>{text.slice(cursor, h.start)}</span>,
      );
    }
    parts.push(
      <mark
        key={`h-${h.start}`}
        className="bg-[var(--sat-accent-primary)] text-[var(--sat-text-inverse)] rounded-[2px] px-[1px]"
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


/** Centered placeholder for an empty pane. */
function EmptyPane({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center text-[var(--sat-text-muted)]">
      <div className="opacity-60">{icon}</div>
      <p className="text-[13px]">{text}</p>
    </div>
  );
}

interface SearchModalProps {
  /** Called with the matched file path and 1-based line when a result is opened. */
  onOpen: (path: string, line?: number) => void;
}

export function SearchModal({ onOpen }: SearchModalProps) {
  const {
    isSearchOpen,
    closeSearch,
    searchQuery,
    setSearchQuery,
    runSearch,
    searchResults,
    searchTotalHits,
    isSearchLoading,
    searchSelectedIndex,
    searchSelectNext,
    searchSelectPrev,
  } = useSearchStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Flatten file groups into the ordered match list used for navigation/preview.
  const flatMatches = useMemo(
    () =>
      searchResults.flatMap((f: FileMatch) =>
        f.matches.map((m: LineMatch) => ({ ...m, path: f.path, title: f.title })),
      ),
    [searchResults],
  );

  const selected = flatMatches[searchSelectedIndex];
  const selectedFile = selected ? searchResults.find((f) => f.path === selected.path) : undefined;
  const totalMatches = flatMatches.length;
  // Flatten into a windowed list model for virtualization (25k-vault safe).
  const flatItems = useMemo(() => {
    const items: Array<
      | { type: "file"; file: FileMatch }
      | { type: "match"; file: FileMatch; match: LineMatch; gi: number }
    > = [];
    let gi = -1;
    for (const file of searchResults) {
      items.push({ type: "file", file });
      for (const m of file.matches) {
        gi += 1;
        items.push({ type: "match", file, match: m, gi });
      }
    }
    return items;
  }, [searchResults]);

  const selectedFlatIndex = useMemo(
    () =>
      flatItems.findIndex(
        (it) => it.type === "match" && it.gi === searchSelectedIndex,
      ),
    [flatItems, searchSelectedIndex],
  );

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (flatItems[i].type === "file" ? 34 : 40),
    overscan: 12,
  });

  useEffect(() => {
    if (selectedFlatIndex >= 0) {
      virtualizer.scrollToIndex(selectedFlatIndex, { align: "auto" });
    }
  }, [searchSelectedIndex, selectedFlatIndex, virtualizer]);
  const showCount = searchQuery.trim().length > 0;

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isSearchOpen]);

  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setSearchQuery(q);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runSearch(q), 150);
    },
    [setSearchQuery, runSearch],
  );

  const openSelected = useCallback(() => {
    if (!selected) return;
    onOpen(selected.path, selected.lineNumber);
    closeSearch();
  }, [selected, onOpen, closeSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        searchSelectNext();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        searchSelectPrev();
      } else if (e.key === "Escape") {
        closeSearch();
      } else if (e.key === "Enter") {
        e.preventDefault();
        openSelected();
      }
    },
    [searchSelectNext, searchSelectPrev, closeSearch, openSelected],
  );

  return (
    <Dialog
      open={isSearchOpen}
      onOpenChange={(o: boolean) => {
        if (!o) closeSearch();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[min(92vw,960px)] w-full h-[68vh] p-0 gap-0 overflow-hidden grid grid-rows-[auto_minmax(0,1fr)_auto] bg-[var(--sat-surface-2)] ring-1 ring-[var(--sat-layout-border)]"
      >
        {/* HEADER: input (left) + preview title (right) — one continuous divider */}
        <div className="grid grid-cols-[minmax(0,42%)_minmax(0,1fr)] border-b border-[var(--sat-layout-border)]">
          {/* input cell */}
          <div className="px-3 py-2 border-r border-[var(--sat-layout-border)]">
            <div className="flex items-center gap-2 rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)] px-2.5 py-1.5">
              <IconSearch className="size-4 shrink-0 text-[var(--sat-text-muted)]" />
              <input
                ref={inputRef}
                value={searchQuery}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Search in vault…"
                spellCheck={false}
                className="flex-1 min-w-0 bg-transparent text-[13px] text-[var(--sat-text-primary)] outline-none placeholder:text-[var(--sat-text-muted)]"
              />
              {showCount && (
                <span className="shrink-0 text-[11px] tabular-nums text-[var(--sat-text-muted)]">
                  {totalMatches}/{searchTotalHits}
                </span>
              )}
            </div>
          </div>
          {/* preview title cell */}
          <div className="flex items-center gap-2 px-4 py-2.5">
            <IconFileText className="size-4 shrink-0 text-[var(--sat-text-muted)]" />
            <span className="truncate text-[12px] font-medium text-[var(--sat-text-primary)]">
              {selected ? selected.title : "Preview"}
            </span>
          </div>
        </div>

        {/* CONTENT: results (left) + preview (right) */}
        <div className="grid grid-cols-[minmax(0,42%)_minmax(0,1fr)] min-h-0">
          <div
            ref={scrollRef}
            className="overflow-y-auto min-h-0 border-r border-[var(--sat-layout-border)]"
          >
            {flatItems.length === 0 ? (
              <EmptyPane
                icon={<IconFileSearch className="size-8" />}
        showCloseButton={false}
        className="sm:max-w-[min(92vw,960px)] w-full h-[85vh] p-0 gap-0 overflow-hidden grid grid-rows-[auto_minmax(0,1fr)_auto] bg-[var(--sat-surface-2)] ring-1 ring-[var(--sat-layout-border)]"
                    ? "No results found"
                    : "Search your vault"
                }
              />
            ) : (
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  position: "relative",
                  width: "100%",
                }}
              >
                {virtualizer.getVirtualItems().map((vi) => {
                  const item = flatItems[vi.index];
                  const rowStyle: React.CSSProperties = {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                  };
                  if (item.type === "file") {
                    return (
                      <div
                        key={`file-${item.file.path}`}
                        style={rowStyle}
                        className="flex items-center gap-2 px-4 py-1.5 bg-[var(--sat-surface-2)] border-b border-[var(--sat-layout-border)]"
                      >
                        <IconFileText className="size-3.5 shrink-0 text-[var(--sat-text-muted)]" />
                        <span className="flex-1 text-[12px] font-semibold truncate">
                          {item.file.title}
                        </span>
                        <span className="text-[10px] tabular-nums text-[var(--sat-text-muted)]">
                          {item.file.matches.length}
                        </span>
                      </div>
                    );
                  }
                  const { file, match, gi } = item;
                  const isSelected = gi === searchSelectedIndex;
                  return (
                    <Button
                      key={`${file.path}:${match.lineNumber}`}
                      style={rowStyle}
                      variant="ghost"
                      tabIndex={-1}
                      className={[
                        "w-full flex-col items-start gap-0.5 px-4 py-1.5 h-auto rounded-none text-left",
                        isSelected
                          ? "bg-[var(--sat-surface-3)]"
                          : "hover:bg-[var(--sat-surface-1)]",
                      ].join(" ")}
                      onClick={() => {
                        onOpen(file.path, match.lineNumber);
                        closeSearch();
                      }}
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
                })}
              </div>
            )}
          </div>

          <div className="overflow-y-auto min-h-0">
            {selectedFile ? (
              <PreviewPane
                text={selectedFile.text}
                path={selectedFile.path}
                matchLine={selected.lineNumber}
                highlights={selected.highlights}
              />
            ) : (
              <EmptyPane
                icon={<IconFileSearch className="size-8" />}
                text="Select a match to preview"
              />
            )}
          </div>
        </div>

        <PaletteShellFooter />
      </DialogContent>
    </Dialog>
  );
}
