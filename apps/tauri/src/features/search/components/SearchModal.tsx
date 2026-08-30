import { Dialog, DialogContent } from "@workspace/ui/components/ui/dialog";
import { PaletteShellFooter } from "@workspace/ui/components/palette-shell";
import { IconFileSearch, IconFileText, IconSearch } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useSearchStore } from "../store";
import { PreviewPane } from "./PreviewPane";
import { FileRow, MatchRow } from "./SearchResultRows";
import type { FileMatch, LineMatch } from "../types";

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
    estimateSize: (i) => (flatItems[i].type === "file" ? 38 : 48),
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
      debounceRef.current = setTimeout(() => runSearch(q), 200);
    },
    [setSearchQuery, runSearch],
  );

  const openSelected = useCallback(() => {
    if (!selected) return;
    onOpen(selected.path, selected.lineNumber);
    closeSearch();
  }, [selected, onOpen, closeSearch]);

  // Stable row handler — passed through to memoized rows so a selection
  // change doesn't re-create handler identity and defeat the memo.
  const openItem = useCallback(
    (path: string, line: number) => {
      onOpen(path, line);
      closeSearch();
    },
    [onOpen, closeSearch],
  );

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
        className="sm:max-w-[min(92vw,960px)] w-full h-[85vh] p-0 gap-0 overflow-hidden grid grid-rows-[auto_minmax(0,1fr)_auto] bg-[var(--sat-surface-2)] ring-1 ring-[var(--sat-layout-border)]"
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
                  {totalMatches} in {searchTotalHits} files
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
                text={
                  searchQuery && !isSearchLoading
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
                  if (item.type === "file") {
                    return (
                      <FileRow
                        key={`file-${item.file.path}`}
                        file={item.file}
                        top={vi.start}
                      />
                    );
                  }
                  const { file, match, gi } = item;
                  return (
                    <MatchRow
                      key={`${file.path}:${match.lineNumber}`}
                      file={file}
                      match={match}
                      selected={gi === searchSelectedIndex}
                      top={vi.start}
                      onOpen={openItem}
                    />
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
