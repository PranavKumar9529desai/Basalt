import { cn } from "@workspace/ui/lib/utils";
import * as React from "react";

/**
 * Label — shadcn-style primitives wrapper. This base-ui version has no
 * dedicated Label part, so this is a plain styled `<label>` following the
 * same data-slot / `cn` convention as the other ui/ primitives (ADR-003).
 * The a11y rule fires on the bare element; call sites always pass `htmlFor`.
 */
// eslint-disable-next-line jsx-a11y/label-has-associated-control
function Label({
  className,
  ...props
}: React.ComponentProps<"label">) {
  return (
    // oxlint-disable-next-line jsx-a11y/label-has-associated-control -- primitives can't know the control id; call sites pass htmlFor
    <label
      data-slot="label"
      className={cn(
        "text-xs font-medium text-[var(--sat-text-secondary)]",
        className,
      )}
      {...props}
    />
  );
}

export { Label };