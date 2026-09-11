import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@workspace/ui/lib/utils";

/**
 * Slider — shadcn-style wrapper over @base-ui/react/slider with the
 * --sat theme tokens baked in (ADR-002/003). Track + accent fill +
 * white thumb, visuals adopted from SettingSlider. Fill width is driven
 * by the `Indicator` part — no manual percentage div at call sites.
 */

function SliderRoot<Value extends number | readonly number[] = number>({
  className,
  ...props
}: SliderPrimitive.Root.Props<Value>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className,
      )}
      {...props}
    />
  );
}

function SliderControl({ className, ...props }: SliderPrimitive.Control.Props) {
  return (
    <SliderPrimitive.Control
      data-slot="slider-control"
      className={cn("relative flex h-5 w-full items-center", className)}
      {...props}
    />
  );
}

function SliderTrack({ className, ...props }: SliderPrimitive.Track.Props) {
  return (
    <SliderPrimitive.Track
      data-slot="slider-track"
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--sat-surface-3)]",
        className,
      )}
      {...props}
    />
  );
}

function SliderIndicator({
  className,
  ...props
}: SliderPrimitive.Indicator.Props) {
  return (
    <SliderPrimitive.Indicator
      data-slot="slider-indicator"
      className={cn(
        "absolute inset-y-0 rounded-full bg-[var(--sat-accent-primary)]",
        className,
      )}
      {...props}
    />
  );
}

function SliderThumb({ className, ...props }: SliderPrimitive.Thumb.Props) {
  return (
    <SliderPrimitive.Thumb
      data-slot="slider-thumb"
      className={cn(
        "block h-4 w-4 rounded-full border border-[var(--sat-layout-border)] bg-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sat-accent-primary)]",
        className,
      )}
      {...props}
    />
  );
}

/** Compound namespace — mirrors `Slider.Root` … base-ui usage at a glance. */
const Slider = {
  Root: SliderRoot,
  Control: SliderControl,
  Track: SliderTrack,
  Indicator: SliderIndicator,
  Thumb: SliderThumb,
};

export {
  Slider,
  SliderRoot,
  SliderControl,
  SliderTrack,
  SliderIndicator,
  SliderThumb,
};
