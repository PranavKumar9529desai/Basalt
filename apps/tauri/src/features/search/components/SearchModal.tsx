import { Button } from "@workspace/ui/components/ui/button";
import {
  PaletteShell,
  PaletteShellInput,
  PaletteShellFooter,
} from "@workspace/ui/components/palette-shell";
import { useCallback, useEffect, useRef } from "react";

import { useSearchStore } from "../store";
import type { ContentResult, Snippet } from "../types";

/** Renders a single snippet with inline highlighted spans. */
function SnippetPreview({ snippet }: { snippet: Snippet }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  const sorted = [...snippet.highlights].sort((a, b) => a.start - b.start);

  for (const h of sorted) {
    if (h.start > cursor) {
      parts.push(
        <span key={`t-${cursor}`}>{snippet.text.slice(cursor, h.start)}</span>,
      );
    }
    parts.push(
      <mark
        key={`h-${h.start}`}
        className="bg-primary text-primary-foreground rounded-[2px] px-[1px]"
      >
        {snippet.text.slice(h.start, h.end)}
      </mark>,
    );
    cursor = h.end;
  }
  if (cursor < snippet.text.length) {
    parts.push(<span key="t-end">{snippet.text.slice(cursor)}</span>);
  }

  return (
    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
      {parts}
    </p>
  );
}

function ResultRow({
  result,
  isSelected,
  onClick,
  rowRef,
}: {
  result: ContentResult;
  isSelected: boolean;
  onClick: () => void;
  rowRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const parts = result.path.split("/");
  const dir = parts.slice(0, -1).join("/");

  return (
    <Button
      ref={rowRef}
      variant="ghost"
      tabIndex={-1}
      className={[
        "w-full flex-col items-start gap-1 px-4 py-3 h-auto rounded-none",
        isSelected ? "bg-accent" : "",
      ].join(" ")}
      onClick={onClick}
    >
      <div className="flex items-baseline gap-2 w-full">
        <span className="text-sm font-medium truncate">{result.title}</span>
        {dir && (
          <span className="text-[11px] text-muted-foreground truncate">
            {dir}
          </span>
        )}
      </div>
      {result.snippets[0] && <SnippetPreview snippet={result.snippets[0]} />}
    </Button>
  );
}

interface SearchModalProps {
  onOpen: (path: string) => void;
}

export function SearchModal({ onOpen }: SearchModalProps) {
  const {
    isSearchOpen,
    closeSearch,
    searchQuery,
    setSearchQuery,
    runSearch,
    searchResults,
    isSearchLoading,
    searchSelectedIndex,
    searchSelectNext,
    searchSelectPrev,
  } = useSearchStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isSearchOpen]);

  // Scroll selected row into view without stealing focus from input.
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [searchSelectedIndex]);

  // Clean up pending debounce on unmount to avoid stale IPC calls.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setSearchQuery(q);
      // 150 ms debounce before firing tantivy
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runSearch(q), 150);
    },
    [setSearchQuery, runSearch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); searchSelectNext(); }
      if (e.key === "ArrowUp")   { e.preventDefault(); searchSelectPrev(); }
      if (e.key === "Escape")    { closeSearch(); }
      if (e.key === "Enter") {
        const result = searchResults[searchSelectedIndex];
        if (result) { onOpen(result.path); closeSearch(); }
      }
    },
    [searchSelectNext, searchSelectPrev, closeSearch, searchResults, searchSelectedIndex, onOpen],
  );

  return (
    <PaletteShell
      open={isSearchOpen}
      onOpenChange={(o: boolean) => { if (!o) closeSearch(); }}
      maxWidth="sm:max-w-[640px]"
    >
      <PaletteShellInput
        inputRef={inputRef}
        value={searchQuery}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Search in vault…"
        isLoading={isSearchLoading}
      />

      <div className="max-h-[420px] overflow-y-auto">
        {searchResults.length === 0 && searchQuery && !isSearchLoading ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">No results found</p>
        ) : (
          searchResults.map((r, i) => (
            <ResultRow
              key={r.path}
              result={r}
              isSelected={i === searchSelectedIndex}
              onClick={() => { onOpen(r.path); closeSearch(); }}
              rowRef={i === searchSelectedIndex ? selectedRowRef : undefined}
            />
          ))
        )}
      </div>

      <PaletteShellFooter />
    </PaletteShell>
  );
}
