import { cn } from "@workspace/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] focus-visible:ring-3 focus-visible:ring-[var(--sat-accent-primary)] focus-visible:outline-none",
  {
    variants: {
      variant: {
        secondary:
          "border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] text-[var(--sat-text-secondary)]",
        outline:
          "border-[var(--sat-layout-border)] text-[var(--sat-text-muted)]",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  },
);

/** Badge — pill-shaped tag/chip primitive (ADR-003). */
function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };