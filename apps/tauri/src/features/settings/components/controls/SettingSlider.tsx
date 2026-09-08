import { Slider as SliderRoot } from "@base-ui/react/slider";
import { cn } from "@workspace/ui/lib/utils";

export interface SettingSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Suffix for the numeric readout, e.g. "%" or "px". */
  unit?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * SettingSlider — range slider with numeric readout (ADR-037 §3.3 /
 * spec §4.5). Value updates live; commit (persist) fires on release.
 */
export function SettingSlider({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  unit = "",
  disabled,
  className,
}: SettingSliderProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div
      className={cn(
        "flex items-center gap-3 w-[160px]",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      <SliderRoot.Root
        value={value}
        onValueChange={onValueChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="flex-1"
      >
        <SliderRoot.Control className="relative flex h-5 items-center w-full touch-none">
          <SliderRoot.Track className="relative h-1.5 w-full rounded-full bg-[var(--sat-surface-3)] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--sat-accent-primary)]"
              style={{ width: `${pct}%` }}
            />
          </SliderRoot.Track>
          <SliderRoot.Thumb className="absolute h-4 w-4 rounded-full bg-white shadow-sm border border-[var(--sat-layout-border)] block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sat-accent-primary)]" />
        </SliderRoot.Control>
      </SliderRoot.Root>
      <span className="w-8 text-right text-xs font-mono text-[var(--sat-text-muted)] flex-shrink-0">
        {value}
        {unit}
      </span>
    </div>
  );
}