import { Input } from "@workspace/ui/components/ui/input";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useRef, useState } from "react";

export interface SettingInputProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number";
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

/** Debounce delay for text persistence — spec §4.4: 300ms or on blur. */
const DEBOUNCE_MS = 300;

/**
 * SettingInput — text/number input (ADR-037 §3.3 / spec §4.4).
 * Local state while typing; persists after 300ms idle or on blur so the
 * store isn't churned per keystroke.
 */
export function SettingInput({
  value,
  onValueChange,
  placeholder,
  type = "text",
  min,
  max,
  step,
  disabled,
  className,
}: SettingInputProps) {
  const [draft, setDraft] = useState(value);
  const committedRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync when the store value changes externally (e.g. reset, backend).
  useEffect(() => {
    if (value !== committedRef.current) {
      committedRef.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const commit = (next: string) => {
    committedRef.current = next;
    onValueChange(next);
  };

  return (
    <Input
      type={type}
      value={draft}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => {
        setDraft(e.target.value);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => commit(e.target.value), DEBOUNCE_MS);
      }}
      onBlur={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (draft !== committedRef.current) commit(draft);
      }}
      className={cn(
        "h-8 w-[220px] text-xs rounded-md bg-[var(--sat-surface-2)] border-[var(--sat-layout-border)] text-[var(--sat-text-primary)] placeholder:text-[var(--sat-text-muted)] focus-visible:ring-1 focus-visible:ring-[var(--sat-accent-primary)]",
        className,
      )}
    />
  );
}