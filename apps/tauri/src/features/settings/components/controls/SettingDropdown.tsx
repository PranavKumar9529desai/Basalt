import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { Select } from "@workspace/ui/components/ui/select";
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
      <Select.Trigger className={cn("min-w-[140px]", className)}>
        <Select.Value />
        <Select.Icon>
          <IconChevronDown size={12} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} align="start">
          <Select.Popup>
            <Select.List>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value}>
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
