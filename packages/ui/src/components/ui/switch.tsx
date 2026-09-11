import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@workspace/ui/lib/utils";

/**
 * Switch — shadcn-style wrapper over @base-ui/react/switch with the
 * --sat theme tokens baked in (ADR-002/003). Accent track when checked,
 * sliding white thumb. Visuals adopted from SettingToggle so settings,
 * graph controls, and any future toggle share one look.
 */

function SwitchRoot({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "h-5 w-9 shrink-0 rounded-full bg-[var(--sat-surface-3)] transition-colors data-[checked]:bg-[var(--sat-accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sat-accent-primary)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function SwitchThumb({ className, ...props }: SwitchPrimitive.Thumb.Props) {
  return (
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className={cn(
        "block h-3.5 w-3.5 translate-x-[3px] rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-[18px]",
        className,
      )}
      {...props}
    />
  );
}

/** Compound namespace — mirrors `Switch.Root`/`Switch.Thumb` usage. */
const Switch = {
  Root: SwitchRoot,
  Thumb: SwitchThumb,
};

export { Switch, SwitchRoot, SwitchThumb };
