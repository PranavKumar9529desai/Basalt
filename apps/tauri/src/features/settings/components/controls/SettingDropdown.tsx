import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { Select } from "@base-ui/react/select";
import { cn } from "@workspace/ui/lib/utils";
import type { SettingOption } from "../../types";

export interface SettingDropdownProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SettingOption[];
  disabled?: boolean;
  className?: string;
}

/**
 * SettingDropdown — enumerated-choice select (ADR-037 §3.3 / spec §4.2).
 * Styled with --sat tokens; right chevron; checkmark on the selected item.
 */
export function SettingDropdown({
  value,
  onValueChange,
  options,
  disabled,
  className,
}: SettingDropdownProps) {
  return (
    <Select.Root
      value={value}
      onValueChange={(v) => {
        // Base UI reports null when the selection is cleared — ignore it.
        if (v !== null) onValueChange(v);
      }}
      items={options}
      disabled={disabled}
    >
      <Select.Trigger
        className={cn(
          "flex h-8 min-w-[140px] items-center justify-between gap-2 rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] px-2.5 text-xs text-[var(--sat-text-primary)] hover:border-[var(--sat-text-muted)] focus:ring-1 focus:ring-[var(--sat-accent-primary)] focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
          className,
        )}
      >
        <Select.Value />
        <Select.Icon className="flex-shrink-0 text-[var(--sat-text-muted)]">
          <IconChevronDown size={12} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} align="start">
          <Select.Popup className="z-50 min-w-[160px] rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] p-1 shadow-2xl">
            <Select.List>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs text-[var(--sat-text-secondary)] data-[highlighted]:bg-[var(--sat-surface-3)] data-[highlighted]:text-[var(--sat-text-primary)] data-[selected]:text-[var(--sat-accent-primary)] select-none outline-none"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <IconCheck size={12} className="flex-shrink-0" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
