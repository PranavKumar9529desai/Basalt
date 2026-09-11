import { Switch } from "@workspace/ui/components/ui/switch";
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
      className={cn(className)}
    >
      <Switch.Thumb />
    </Switch.Root>
  );
}