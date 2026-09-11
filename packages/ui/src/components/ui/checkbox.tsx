import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { IconCheck } from "@tabler/icons-react";
import { cn } from "@workspace/ui/lib/utils";

/**
 * Checkbox — shadcn-style wrapper over @base-ui/react/checkbox with the
 * --sat theme tokens baked in (ADR-002/003). Accent fill + white check
 * when checked.
 */

function CheckboxRoot({
  className,
  ...props
}: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] transition-colors data-[checked]:border-[var(--sat-accent-primary)] data-[checked]:bg-[var(--sat-accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sat-accent-primary)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function CheckboxIndicator({
  className,
  children,
  ...props
}: CheckboxPrimitive.Indicator.Props) {
  return (
    <CheckboxPrimitive.Indicator
      data-slot="checkbox-indicator"
      className={cn(
        "flex items-center justify-center text-[var(--sat-text-inverse)]",
        className,
      )}
      {...props}
    >
      {children ?? <IconCheck className="h-3 w-3" />}
    </CheckboxPrimitive.Indicator>
  );
}

/** Compound namespace — mirrors `Checkbox.Root`/`Checkbox.Indicator`. */
const Checkbox = {
  Root: CheckboxRoot,
  Indicator: CheckboxIndicator,
};

export { Checkbox, CheckboxRoot, CheckboxIndicator };