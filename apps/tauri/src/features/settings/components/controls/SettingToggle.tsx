import { Switch } from "@base-ui/react/switch";
import { cn } from "@workspace/ui/lib/utils";

export interface SettingToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * SettingToggle — accessible boolean switch (ADR-037 §3.3 / spec §4.1).
 * Accent track when checked, sliding white thumb.
 */
export function SettingToggle({
  checked,
  onCheckedChange,
  disabled,
  className,
}: SettingToggleProps) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        "w-9 h-5 rounded-full bg-[var(--sat-surface-3)] transition-colors data-[checked]:bg-[var(--sat-accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sat-accent-primary)] disabled:opacity-50 disabled:cursor-not-allowed shrink-0",
        className,
      )}
    >
      <Switch.Thumb className="block w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-[18px] translate-x-[3px]" />
    </Switch.Root>
  );
}