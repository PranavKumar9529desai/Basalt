import { IconSearch, IconX } from "@tabler/icons-react";
import { useRef } from "react";
import { Button } from "@workspace/ui/components/ui/button";

export interface SettingsSearchProps {
  value: string;
  onChange: (query: string) => void;
  autoFocus?: boolean;
}

/**
 * SettingsSearch — the sidebar's header search input (ADR-037 §4.1 / spec §2.1).
 * Leading magnifying-glass icon, one-keystroke clearance via the X
 * button (which refocuses the input), Escape in the parent clears too.
 */
export function SettingsSearch({
  value,
  onChange,
  autoFocus,
}: SettingsSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative flex items-center">
      <IconSearch
        size={14}
        className="absolute left-2.5 text-[var(--sat-text-muted)] flex-shrink-0"
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
            inputRef.current?.focus();
          }
        }}
        placeholder="Search settings..."
        // eslint-disable-next-line jsx-a11y/no-autofocus -- Intentional: focus search when settings opens (spec §2.1)
        autoFocus={autoFocus}
        className="h-8 w-full pl-8 pr-7 text-xs rounded-md bg-[var(--sat-surface-1)] border border-[var(--sat-layout-border)] text-[var(--sat-text-primary)] placeholder:text-[var(--sat-text-muted)] focus:ring-1 focus:ring-[var(--sat-accent-primary)] focus:outline-none transition-colors"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label="Clear settings search"
          className="absolute right-2"
        >
          <IconX size={12} />
        </Button>
      )}
    </div>
  );
}
