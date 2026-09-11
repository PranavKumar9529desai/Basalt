import { Slider } from "@workspace/ui/components/ui/slider";
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
  return (
    <div
      className={cn(
        "flex items-center gap-3 w-[160px]",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      <Slider.Root
        value={value}
        onValueChange={onValueChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="flex-1"
      >
        <Slider.Control>
          <Slider.Track>
            <Slider.Indicator />
          </Slider.Track>
          <Slider.Thumb />
        </Slider.Control>
      </Slider.Root>
      <span className="w-8 text-right text-xs font-mono text-[var(--sat-text-muted)] flex-shrink-0">
        {value}
        {unit}
      </span>
    </div>
  );
}