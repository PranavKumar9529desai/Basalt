import { cn } from "@workspace/ui/lib/utils";

export interface SettingColorOption {
  label: string;
  value: string;
}

export interface SettingColorProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SettingColorOption[];
  disabled?: boolean;
  className?: string;
}

/**
 * SettingColor — accent swatch picker (ADR-037 §3.3). Renders preset
 * color dots; the active swatch gets an accent ring + checkmark.
 */
export function SettingColor({
  value,
  onValueChange,
  options,
  disabled,
  className,
}: SettingColorProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={option.value}
            type="button"
            title={option.label}
            aria-label={`Accent color: ${option.label}`}
            aria-pressed={active}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "h-6 w-6 rounded-full transition-transform cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sat-accent-primary)]",
              active ? "scale-110 ring-2 ring-[var(--sat-accent-primary)] ring-offset-2 ring-offset-[var(--sat-surface-1)]" : "hover:scale-105",
            )}
            style={{ backgroundColor: option.value }}
          />
        );
      })}
    </div>
  );
}