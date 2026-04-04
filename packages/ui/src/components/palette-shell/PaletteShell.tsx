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
          "p-0 overflow-hidden border-none shadow-none bg-popover top-[15vh] translate-y-0 ring-1 ring-border",
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
  inputRef?: React.RefObject<HTMLInputElement | null>;
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
    <div className="flex items-center gap-2 px-4 py-3">
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
  icon: React.ReactNode;
  label: string;
}

export interface PaletteShellFooterProps {
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

export function PaletteShellFooter({
  hints = DEFAULT_HINTS,
}: PaletteShellFooterProps) {
  return (
    <div className="flex justify-center items-center gap-6 px-4 py-2.5 bg-muted/5 w-full">
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
