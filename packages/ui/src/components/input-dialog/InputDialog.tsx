import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

export interface InputDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called when the dialog should close. */
  onOpenChange: (open: boolean) => void;
  /** Dialog title, e.g. "New note" or "New folder". */
  title: string;
  /** Optional description text below the title. */
  description?: string;
  /** Placeholder text for the input. */
  placeholder?: string;
  /** Label for the submit button. Default: "Create". */
  submitLabel?: string;
  /** Called with the input value when the user submits. */
  onSubmit: (value: string) => void;
  /** Optional validation error to display. */
  error?: string | null;
  /** Whether submission is in progress (disables the button). */
  isLoading?: boolean;
}

export function InputDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  submitLabel = "Create",
  onSubmit,
  error,
  isLoading,
}: InputDialogProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset value when dialog opens
  useEffect(() => {
    if (open) {
      setValue("");
      // Focus the input after dialog animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  }, [value, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] bg-[var(--sat-surface-2)] border-[var(--sat-layout-border)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--sat-text-primary)]">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-[var(--sat-text-muted)]">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="py-2">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="bg-[var(--sat-surface-1)] border-[var(--sat-layout-border)] text-[var(--sat-text-primary)] placeholder:text-[var(--sat-text-muted)]"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- Intentional: focus input when dialog opens
            autoFocus
          />
          {error && (
            <p className="text-xs text-[var(--sat-state-danger)] mt-1.5">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-[var(--sat-text-secondary)] hover:text-[var(--sat-text-primary)]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!value.trim() || isLoading}
            className="bg-[var(--sat-accent-primary)] text-[var(--sat-text-inverse)] hover:opacity-90"
          >
            {isLoading ? "Creating…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
