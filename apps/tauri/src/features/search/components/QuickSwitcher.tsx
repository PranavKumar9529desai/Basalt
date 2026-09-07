import {
  HighlightedText,
  PaletteShell,
  PaletteShellFooter,
  PaletteShellInput,
} from "@workspace/ui/components/palette-shell";
import { Button } from "@workspace/ui/components/ui/button";
import { IconFilePlus } from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSearchStore } from "../store";
import type { FileResult } from "../types";

function ResultRow({
  result,
  isSelected,
  onClick,
  optionId,
  query,
}: {
  result: FileResult;
  isSelected: boolean;
  onClick: () => void;
  optionId: string;
  query: string;
}) {
  const parts = result.path.split("/");
  const rawName = parts.pop() ?? result.path;
  const dir = parts.join("/");
  const isCanvas = result.path.endsWith(".canvas");
  const displayName = isCanvas
    ? rawName.replace(/\.canvas$/i, "")
    : rawName.replace(/\.md$/i, "");

  return (
    <Button
      id={optionId}
      // Virtualized rows cannot use native <option> elements.
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="option"
      aria-selected={isSelected}
      variant="ghost"
      tabIndex={-1}
      className={[
        "w-full justify-start gap-2.5 px-4 py-2 h-auto rounded-md",
        isSelected
          ? "bg-[var(--sat-surface-3)] text-[var(--sat-text-primary)]"
          : "",
      ].join(" ")}
      onClick={onClick}
    >
      <span className="text-sm font-medium truncate">
        <HighlightedText text={displayName} query={query} />
      </span>
      {isCanvas && (
        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--sat-accent-primary)]/20 text-[var(--sat-accent-primary)] shrink-0">
          Canvas
        </span>
      )}
      {dir && (
        <span className="text-xs text-muted-foreground truncate ml-auto shrink-0 max-w-[40%]">
          {dir}
        </span>
      )}
    </Button>
  );
}

/**
 * "Create new note: <query>" row (Obsidian quick-switcher parity). Rendered
 * as the last option whenever the query names no existing file, so Enter
 * creates the typed note instead of merely opening one.
 */
function CreateNoteRow({
  query,
  isSelected,
  onClick,
  optionId,
  disabled,
}: {
  query: string;
  isSelected: boolean;
  onClick: () => void;
  optionId: string;
  disabled?: boolean;
}) {
  return (
    <Button
      id={optionId}
      // Custom role on a Button — not a native <option>.
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="option"
      aria-selected={isSelected}
      variant="ghost"
      tabIndex={-1}
      disabled={disabled}
      className={[
        "w-full justify-start gap-2.5 px-4 py-2 h-auto rounded-md",
        isSelected
          ? "bg-[var(--sat-surface-3)] text-[var(--sat-text-primary)]"
          : "",
      ].join(" ")}
      onClick={onClick}
    >
      <IconFilePlus size={16} stroke={1.5} className="shrink-0" />
      <span className="text-sm font-medium truncate">
        Create new note: <HighlightedText text={query} query={query} />
      </span>
    </Button>
  );
}

interface QuickSwitcherProps {
  /** Called when the user confirms a result. Receives the absolute file path. */
  onOpen: (path: string) => void;
  /** Called when the user confirms the "Create new note: <query>" row.
   *  Resolves to whether the note was created; the switcher closes on success. */
  onCreate?: (name: string) => boolean | Promise<boolean>;
}

export function QuickSwitcher({ onOpen, onCreate }: QuickSwitcherProps) {
  const {
    isSwitcherOpen,
    closeSwitcher,
    switcherQuery,
    setSwitcherQuery,
    runSwitcher,
    switcherResults,
    switcherSelectedIndex,
    switcherSelectNext,
    switcherSelectPrev,
    isSwitcherLoading,
    switcherError,
    switcherCanCreate,
  } = useSearchStore();

  const parentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: switcherResults.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
    paddingStart: 4,
    paddingEnd: 4,
  });

  // Focus input when modal opens.
  useEffect(() => {
    if (isSwitcherOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [isSwitcherOpen]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // Keep the selected row visible without stealing focus from the input.
  useEffect(() => {
    rowVirtualizer.scrollToIndex(switcherSelectedIndex, { align: "auto" });
  }, [switcherSelectedIndex, rowVirtualizer]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setSwitcherQuery(q);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void runSwitcher(q), 180);
    },
    [setSwitcherQuery, runSwitcher],
  );
  const handleCreate = useCallback(async () => {
    if (isCreating) return;
    setCreateError(null);
    setIsCreating(true);
    try {
      const ok = await onCreate?.(switcherQuery.trim());
      if (ok) closeSwitcher();
      else setCreateError("Could not create note");
    } finally {
      setIsCreating(false);
    }
  }, [onCreate, switcherQuery, closeSwitcher, isCreating]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        switcherSelectNext();
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        switcherSelectPrev();
      }
      if (e.key === "Escape") {
        closeSwitcher();
      }
      if (e.key === "Enter") {
        if (
          onCreate &&
          switcherCanCreate &&
          switcherSelectedIndex === switcherResults.length
        ) {
          e.preventDefault();
          void handleCreate();
          return;
        }
        const result = switcherResults[switcherSelectedIndex];
        if (result) {
          onOpen(result.path);
          closeSwitcher();
        }
      }
    },
    [
      switcherSelectNext,
      switcherSelectPrev,
      closeSwitcher,
      switcherResults,
      switcherSelectedIndex,
      onOpen,
      onCreate,
      switcherCanCreate,
      handleCreate,
    ],
  );

  return (
    <PaletteShell
      open={isSwitcherOpen}
      onOpenChange={(o: boolean) => {
        if (!o) closeSwitcher();
      }}
      maxWidth="sm:max-w-[650px]"
    >
      <PaletteShellInput
        inputRef={inputRef}
        value={switcherQuery}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Open file…"
        isLoading={isSwitcherLoading}
        inputProps={{
          // The palette input owns focus while the virtualized list owns the selection.
          role: "combobox",
          "aria-expanded": switcherResults.length > 0,
          "aria-controls": "quick-switcher-results",
          "aria-activedescendant":
            switcherCanCreate &&
            switcherSelectedIndex === switcherResults.length
              ? "quick-switcher-create"
              : switcherResults[switcherSelectedIndex]
                ? `quick-switcher-${switcherSelectedIndex}`
                : undefined,
          "aria-autocomplete": "list",
        }}
      />

      <div
        ref={parentRef}
        id="quick-switcher-results"
        // Virtualized result rows require an ARIA listbox container rather than native select.
        // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="listbox"
        aria-label="Files"
        className="max-h-[320px] overflow-y-auto px-2"
      >
        {switcherError ? (
          <p className="px-4 py-3 text-sm text-[var(--sat-state-error)]">
            {switcherError}
          </p>
        ) : switcherResults.length === 0 &&
          switcherQuery &&
          !isSwitcherLoading ? (
          <p className="px-4 py-3 text-sm text-[var(--sat-text-muted)]">
            No files found
          </p>
        ) : isSwitcherLoading && switcherResults.length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--sat-text-muted)]">
            Searching…
          </p>
        ) : (
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((vItem) => {
              const r = switcherResults[vItem.index];
              return (
                <div
                  key={r.path}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vItem.start}px)`,
                  }}
                >
                  <ResultRow
                    result={r}
                    isSelected={vItem.index === switcherSelectedIndex}
                    optionId={`quick-switcher-${vItem.index}`}
                    query={switcherQuery}
                    onClick={() => {
                      onOpen(r.path);
                      closeSwitcher();
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      {switcherCanCreate && onCreate && (
        <CreateNoteRow
          query={switcherQuery.trim()}
          isSelected={switcherSelectedIndex === switcherResults.length}
          optionId="quick-switcher-create"
          onClick={() => void handleCreate()}
          disabled={isCreating}
        />
      )}
      {createError && (
        <p className="px-4 py-3 text-sm text-[var(--sat-state-error)]">
          {createError}
        </p>
      )}
      </div>

      <PaletteShellFooter />
    </PaletteShell>
  );
}
