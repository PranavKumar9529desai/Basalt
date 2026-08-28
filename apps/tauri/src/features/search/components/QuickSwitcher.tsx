import {
  PaletteShell,
  PaletteShellFooter,
  PaletteShellInput,
} from "@workspace/ui/components/palette-shell";
import { Button } from "@workspace/ui/components/ui/button";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";

import { useSearchStore } from "../store";
import type { FileResult } from "../types";

function ResultRow({
  result,
  isSelected,
  onClick,
}: {
  result: FileResult;
  isSelected: boolean;
  onClick: () => void;
}) {
  const parts = result.path.split("/");
  const name = parts.pop() ?? result.path;
  const dir = parts.join("/");

  return (
    <Button
      variant="ghost"
      tabIndex={-1}
      className={[
        "w-full justify-start gap-3 px-4 py-2 h-auto rounded-md",
        isSelected ? "bg-accent" : "",
      ].join(" ")}
      onClick={onClick}
    >
      <span className="text-sm font-medium truncate">{name}</span>
      {dir && (
        <span className="text-xs text-muted-foreground truncate ml-auto shrink-0 max-w-[40%]">
          {dir}
        </span>
      )}
    </Button>
  );
}

interface QuickSwitcherProps {
  /** Called when the user confirms a result. Receives the absolute file path. */
  onOpen: (path: string) => void;
}

export function QuickSwitcher({ onOpen }: QuickSwitcherProps) {
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
  } = useSearchStore();

  const parentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isSwitcherOpen]);

  // Keep the selected row visible without stealing focus from the input.
  useEffect(() => {
    rowVirtualizer.scrollToIndex(switcherSelectedIndex, { align: "auto" });
  }, [switcherSelectedIndex, rowVirtualizer]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setSwitcherQuery(q);
      void runSwitcher(q);
    },
    [setSwitcherQuery, runSwitcher],
  );

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
      />

      <div ref={parentRef} className="max-h-[320px] overflow-y-auto px-2">
        {switcherResults.length === 0 && switcherQuery ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No files found
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
      </div>

      <PaletteShellFooter />
    </PaletteShell>
  );
}
