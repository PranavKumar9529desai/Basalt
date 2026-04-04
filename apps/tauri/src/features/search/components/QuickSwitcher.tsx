import { Button } from "@workspace/ui/components/ui/button";
import { Dialog, DialogContent } from "@workspace/ui/components/ui/dialog";
import { Input } from "@workspace/ui/components/ui/input";
import { useCallback, useEffect, useRef } from "react";

import { useSearchStore } from "../store";
import type { FileResult } from "../types";

interface QuickSwitcherProps {
  /** Called when the user confirms a result. Receives the absolute file path. */
  onOpen: (path: string) => void;
}

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

  // Focus input when modal opens.
  useEffect(() => {
    if (isSwitcherOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isSwitcherOpen]);

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
    <Dialog open={isSwitcherOpen} onOpenChange={(o) => { if (!o) closeSwitcher(); }}>
      <DialogContent
        className="p-0 overflow-hidden shadow-2xl sm:max-w-[560px] border-none ring-0 focus:ring-0 bg-popover top-[15vh] translate-y-0"
        showCloseButton={false}
      >
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span className="text-muted-foreground text-base">⌕</span>
          <Input
            ref={inputRef}
            value={switcherQuery}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Open file…"
            className="border-0 shadow-none focus-visible:ring-0 h-auto py-0 bg-transparent"
          />
        </div>

        {/* Results */}
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
              />
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2 flex mx-auto gap-4 text-[10px] text-muted-foreground">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
