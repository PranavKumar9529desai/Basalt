# PaletteShell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a shared `PaletteShell` component (Dialog chrome + input header + footer hints) so that `SearchModal`, `QuickSwitcher`, and `CommandPalette` all use the same structural base instead of copy-pasting `Dialog + DialogContent` styles.

**Architecture:** A `PaletteShell` wrapper component lives in `packages/ui` and owns the `Dialog + DialogContent` with shared styles, exposing `children` for inner content. Two sub-components — `PaletteShellInput` (the ⌕ + borderless `Input` header row) and `PaletteShellFooter` (the ↑↓/↵/esc hint bar) — are composed inside each consumer. `CommandPalette` uses `PaletteShell` for its Dialog wrapper and `PaletteShellFooter` for its footer but keeps `cmdk`'s `Command`+`CommandInput` as its inner content. `SearchModal` and `QuickSwitcher` use all three sub-components and keep their existing store-driven keyboard logic.

**Tech Stack:** React, TypeScript, `@base-ui/react/dialog`, `@tabler/icons-react`, Tailwind CSS, Biome lint, `bun run lint && bunx tsc --noEmit`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/ui/src/components/palette-shell/PaletteShell.tsx` | `PaletteShell`, `PaletteShellInput`, `PaletteShellFooter` components |
| Create | `packages/ui/src/components/palette-shell/index.ts` | barrel export |
| Modify | `packages/ui/src/components/command-palette/CommandPalette.tsx` | use `PaletteShell` + `PaletteShellFooter` |
| Modify | `apps/tauri/src/features/search/components/SearchModal.tsx` | use `PaletteShell` + `PaletteShellInput` + `PaletteShellFooter` |
| Modify | `apps/tauri/src/features/search/components/QuickSwitcher.tsx` | use `PaletteShell` + `PaletteShellInput` + `PaletteShellFooter` |

---

## Task 1: Create PaletteShell component

**Files:**
- Create: `packages/ui/src/components/palette-shell/PaletteShell.tsx`
- Create: `packages/ui/src/components/palette-shell/index.ts`

- [ ] **Step 1: Create PaletteShell.tsx**

```tsx
// packages/ui/src/components/palette-shell/PaletteShell.tsx
import {
  IconArrowDown,
  IconArrowUp,
  IconCornerDownLeft,
} from "@tabler/icons-react";
import { Input } from "@workspace/ui/components/ui/input";
import { Dialog, DialogContent } from "@workspace/ui/components/ui/dialog";
import React from "react";
import { cn } from "@workspace/ui/lib/utils";

// ─── PaletteShell ────────────────────────────────────────────────────────────

export interface PaletteShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tailwind max-width class applied to DialogContent, e.g. "sm:max-w-[640px]" */
  maxWidth?: string;
  children: React.ReactNode;
}

export function PaletteShell({
  open,
  onOpenChange,
  maxWidth = "sm:max-w-[600px]",
  children,
}: PaletteShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 overflow-hidden shadow-2xl border-none ring-0 focus:ring-0 bg-popover top-[15vh] translate-y-0",
          maxWidth,
        )}
        showCloseButton={false}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

// ─── PaletteShellInput ───────────────────────────────────────────────────────

export interface PaletteShellInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  isLoading?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}

export function PaletteShellInput({
  value,
  onChange,
  onKeyDown,
  placeholder = "Search…",
  isLoading = false,
  inputRef,
}: PaletteShellInputProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
      <span className="text-muted-foreground text-base">⌕</span>
      <Input
        ref={inputRef}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="border-0 shadow-none focus-visible:ring-0 h-auto py-0 bg-transparent"
      />
      {isLoading && (
        <div className="w-3 h-3 border-2 border-muted-foreground border-t-primary rounded-full animate-spin" />
      )}
    </div>
  );
}

// ─── PaletteShellFooter ──────────────────────────────────────────────────────

export interface PaletteShellFooterHint {
  /** Icon or text rendered on the left of the hint (e.g. <IconArrowUp />) */
  icon: React.ReactNode;
  label: string;
}

export interface PaletteShellFooterProps {
  /** Override the default ↑↓ / ↵ / esc hints */
  hints?: PaletteShellFooterHint[];
}

const DEFAULT_HINTS: PaletteShellFooterHint[] = [
  {
    icon: (
      <span className="flex items-center gap-0.5">
        <IconArrowUp size={10} />
        <IconArrowDown size={10} />
      </span>
    ),
    label: "to navigate",
  },
  { icon: <IconCornerDownLeft size={10} />, label: "to open" },
  {
    icon: (
      <span className="px-1 py-0.5 rounded text-[9px] uppercase">esc</span>
    ),
    label: "to dismiss",
  },
];

export function PaletteShellFooter({ hints = DEFAULT_HINTS }: PaletteShellFooterProps) {
  return (
    <div className="flex justify-center items-center gap-6 px-4 py-2.5 border-t border-border/10 bg-muted/5 w-full">
      {hints.map((h) => (
        <div
          key={h.label}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium"
        >
          {h.icon}
          <span>{h.label}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create barrel export**

```ts
// packages/ui/src/components/palette-shell/index.ts
export {
  PaletteShell,
  PaletteShellInput,
  PaletteShellFooter,
  type PaletteShellProps,
  type PaletteShellInputProps,
  type PaletteShellFooterProps,
  type PaletteShellFooterHint,
} from "./PaletteShell";
```

- [ ] **Step 3: Verify types compile**

```bash
bunx tsc --noEmit
```

Expected: no errors relating to `palette-shell`.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/palette-shell/
git commit -m "feat(ui): add PaletteShell, PaletteShellInput, PaletteShellFooter base components"
```

---

## Task 2: Refactor CommandPalette to use PaletteShell

**Files:**
- Modify: `packages/ui/src/components/command-palette/CommandPalette.tsx`

The `CommandPalette` keeps `cmdk`'s `Command` wrapping its inner content. We replace the raw `Dialog + DialogContent` with `PaletteShell`, and replace the hand-rolled footer with `PaletteShellFooter`. The `CommandInput` (cmdk) stays as-is because it connects to cmdk's internal state.

- [ ] **Step 1: Rewrite CommandPalette.tsx**

```tsx
// packages/ui/src/components/command-palette/CommandPalette.tsx
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { Button } from "../ui/button";
import {
  PaletteShell,
  PaletteShellFooter,
} from "../palette-shell/PaletteShell";
import React from "react";
import { useCommandState } from "cmdk";
import { IconX } from "@tabler/icons-react";

export interface CommandItemProps {
  id: string;
  name: string;
  icon?: React.ReactNode;
  shortcut?: string;
  category?: string;
}

export interface CommandPaletteProps {
  commands: CommandItemProps[];
  onSelect: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
}

function HighlightedText({ text }: { text: string }) {
  const search = useCommandState((state) => state.search);

  if (!search) return <span>{text}</span>;

  const index = text.toLowerCase().indexOf(search.toLowerCase());
  if (index === -1) return <span>{text}</span>;

  return (
    <span>
      {text.substring(0, index)}
      <span className="text-foreground font-bold underline underline-offset-2">
        {text.substring(index, index + search.length)}
      </span>
      {text.substring(index + search.length)}
    </span>
  );
}

export function CommandPalette({
  commands,
  onSelect,
  open,
  onOpenChange,
  placeholder,
}: CommandPaletteProps) {
  return (
    <PaletteShell open={open} onOpenChange={onOpenChange} maxWidth="sm:max-w-[650px]">
      <Command
        className="w-full flex flex-col h-fit bg-transparent border-none p-0"
        label="Command Palette"
        loop
      >
        <div className="flex items-center w-full pr-4">
          <CommandInput
            placeholder={placeholder ?? "Type a command..."}
            className="flex-1"
            autoFocus
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="size-5 rounded-full bg-muted hover:bg-muted-foreground/40 transition-all flex items-center justify-center text-foreground/70 hover:text-foreground shrink-0"
          >
            <IconX size={10} strokeWidth={3} />
          </Button>
        </div>

        <div className="h-px bg-border/20 mx-4" />

        <CommandList className="max-h-[450px] overflow-y-auto px-2 py-2 w-full no-scrollbar">
          <CommandEmpty className="py-12 text-muted-foreground text-center text-sm">
            No commands found.
          </CommandEmpty>
          <CommandGroup>
            {commands.map((cmd) => (
              <CommandItem
                key={cmd.id}
                onSelect={() => {
                  onSelect(cmd.id);
                  onOpenChange(false);
                }}
                value={`${cmd.name} ${cmd.id}`}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  {cmd.icon && (
                    <span className="h-4 w-4 shrink-0 opacity-70 group-aria-selected/command-item:opacity-100 transition-opacity flex items-center">
                      {cmd.icon}
                    </span>
                  )}
                  <span className="text-foreground">
                    <HighlightedText text={cmd.name} />
                  </span>
                </div>
                {cmd.shortcut && (
                  <div className="flex items-center gap-1 opacity-40 group-aria-selected/command-item:opacity-100 transition-opacity">
                    {(() => {
                      const keys = cmd.shortcut.split("+");
                      return keys.map((key, i) => (
                        <React.Fragment key={key}>
                          <kbd className="text-[10px] font-sans uppercase">
                            {key}
                          </kbd>
                          {i < keys.length - 1 && (
                            <span className="text-[10px]">+</span>
                          )}
                        </React.Fragment>
                      ));
                    })()}
                  </div>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>

        <PaletteShellFooter
          hints={[
            {
              icon: (
                <span className="flex items-center gap-0.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                </span>
              ),
              label: "to navigate",
            },
            {
              icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>,
              label: "to use",
            },
            {
              icon: <span className="px-1 py-0.5 rounded text-[9px] uppercase">esc</span>,
              label: "to dismiss",
            },
          ]}
        />
      </Command>
    </PaletteShell>
  );
}
```

- [ ] **Step 2: Run lint + typecheck**

```bash
bun run lint && bunx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/command-palette/CommandPalette.tsx
git commit -m "refactor(ui): CommandPalette uses PaletteShell for dialog chrome"
```

---

## Task 3: Refactor SearchModal to use PaletteShell

**Files:**
- Modify: `apps/tauri/src/features/search/components/SearchModal.tsx`

Replace `Dialog + DialogContent` with `PaletteShell`. Replace the header div with `PaletteShellInput`. Replace the footer div with `PaletteShellFooter`. All keyboard logic and store bindings stay unchanged.

- [ ] **Step 1: Rewrite SearchModal.tsx**

```tsx
// apps/tauri/src/features/search/components/SearchModal.tsx
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
}: {
  result: ContentResult;
  isSelected: boolean;
  onClick: () => void;
}) {
  const parts = result.path.split("/");
  const dir = parts.slice(0, -1).join("/");

  return (
    <Button
      variant="ghost"
      className={[
        "w-full flex-col items-start gap-1 px-4 py-3 h-auto rounded-none border-l-2",
        isSelected ? "bg-muted border-primary" : "border-transparent",
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

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isSearchOpen]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setSearchQuery(q);
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
      onOpenChange={(o) => { if (!o) closeSearch(); }}
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
            />
          ))
        )}
      </div>

      <PaletteShellFooter />
    </PaletteShell>
  );
}
```

- [ ] **Step 2: Run lint + typecheck**

```bash
bun run lint && bunx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/tauri/src/features/search/components/SearchModal.tsx
git commit -m "refactor(search): SearchModal uses PaletteShell"
```

---

## Task 4: Refactor QuickSwitcher to use PaletteShell

**Files:**
- Modify: `apps/tauri/src/features/search/components/QuickSwitcher.tsx`

Same pattern as Task 3 — replace Dialog chrome with `PaletteShell`, use `PaletteShellInput` and `PaletteShellFooter`.

- [ ] **Step 1: Rewrite QuickSwitcher.tsx**

```tsx
// apps/tauri/src/features/search/components/QuickSwitcher.tsx
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

interface QuickSwitcherProps {
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
    <PaletteShell
      open={isSwitcherOpen}
      onOpenChange={(o) => { if (!o) closeSwitcher(); }}
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
            />
          ))
        )}
      </div>

      <PaletteShellFooter />
    </PaletteShell>
  );
}
```

- [ ] **Step 2: Run lint + typecheck**

```bash
bun run lint && bunx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/tauri/src/features/search/components/QuickSwitcher.tsx
git commit -m "refactor(search): QuickSwitcher uses PaletteShell"
```

---

## Task 5: Final verification

- [ ] **Step 1: Full lint + typecheck**

```bash
bun run lint && bunx tsc --noEmit
```

Expected: zero errors, zero warnings introduced by this work.

- [ ] **Step 2: Dev smoke test**

```bash
bun run dev
```

Open the app and verify:
1. `⌘P` opens the command palette — keyboard navigation, Enter, Escape all work
2. `⌘F` opens the search modal — type a query, ↑↓ selects results, Enter opens a file, Escape closes
3. `⌘O` opens the quick switcher — same keyboard checks

All three should have visually identical chrome (same input header style, same footer hint bar).
