import { Button } from "@workspace/ui/components/ui/button";
import {
  PaletteShell,
  PaletteShellInput,
  PaletteShellFooter,
} from "@workspace/ui/components/palette-shell";
import { useCallback, useEffect, useRef } from "react";

import { useSearchStore } from "../store";
import type { FileResult } from "../types";

function ResultRow({
  result,
  isSelected,
  onClick,
  rowRef,
}: {
  result: FileResult;
  isSelected: boolean;
  onClick: () => void;
  rowRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const parts = result.path.split("/");
  const name = parts.pop() ?? result.path;
  const dir = parts.join("/");

  return (
    <Button
      ref={rowRef}
      variant="ghost"
      tabIndex={-1}
      className={[
        "w-full justify-start gap-3 px-4 py-2 h-auto rounded-none",
        isSelected ? "bg-muted text-foreground" : "",
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

  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);

  // Focus input when modal opens.
  useEffect(() => {
    if (isSwitcherOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isSwitcherOpen]);

  // Scroll selected row into view without stealing focus from input.
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [switcherSelectedIndex]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setSwitcherQuery(q);
      runSwitcher(q);
    },
    [setSwitcherQuery, runSwitcher],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); switcherSelectNext(); }
      if (e.key === "ArrowUp")   { e.preventDefault(); switcherSelectPrev(); }
      if (e.key === "Escape")    { closeSwitcher(); }
      if (e.key === "Enter") {
        const result = switcherResults[switcherSelectedIndex];
        if (result) { onOpen(result.path); closeSwitcher(); }
      }
    },
    [switcherSelectNext, switcherSelectPrev, closeSwitcher, switcherResults, switcherSelectedIndex, onOpen],
  );

  return (
    <PaletteShell
      open={isSwitcherOpen}
      onOpenChange={(o: boolean) => { if (!o) closeSwitcher(); }}
      maxWidth="sm:max-w-[560px]"
    >
      <PaletteShellInput
        inputRef={inputRef}
        value={switcherQuery}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Open file…"
      />

      <div className="max-h-[320px] overflow-y-auto py-1">
        {switcherResults.length === 0 && switcherQuery ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No files found</p>
        ) : (
          switcherResults.map((r, i) => (
            <ResultRow
              key={r.path}
              result={r}
              isSelected={i === switcherSelectedIndex}
              onClick={() => { onOpen(r.path); closeSwitcher(); }}
              rowRef={i === switcherSelectedIndex ? selectedRowRef : undefined}
            />
          ))
        )}
      </div>

      <PaletteShellFooter />
    </PaletteShell>
  );
}
