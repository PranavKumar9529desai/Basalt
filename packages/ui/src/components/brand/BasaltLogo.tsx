import type { FC, HTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import { BasaltMark, type MarkSize } from "./BasaltMark";
import { BasaltWordmark, type WordmarkSize, type WordmarkVariant } from "./BasaltWordmark";

export type LogoLayout = "horizontal" | "vertical";
export type LogoSize = "sm" | "md" | "lg" | "xl";

export interface BasaltLogoProps extends HTMLAttributes<HTMLDivElement> {
  /** Alignment: horizontal lockup (side-by-side) or vertical lockup (stacked) */
  layout?: LogoLayout;
  /** Size preset for entire lockup */
  size?: LogoSize;
  /** Whether to show the typographic wordmark */
  showWordmark?: boolean;
  /** Whether magma glowing elements are active */
  glow?: boolean;
  /** Color variant for wordmark */
  variant?: WordmarkVariant;
}

const MARK_SIZES: Record<LogoSize, MarkSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "xl",
};

const WORDMARK_SIZES: Record<LogoSize, WordmarkSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "xl",
};

/**
 * BasaltLogo — Full brand lockup combining the Basalt Emblem and Wordmark.
 */
export const BasaltLogo: FC<BasaltLogoProps> = ({
  layout = "horizontal",
  size = "md",
  showWordmark = true,
  glow = true,
  variant = "default",
  className,
  ...props
}) => {
  const isVertical = layout === "vertical";

  return (
    <div
      className={cn(
        "inline-flex items-center select-none",
        isVertical ? "flex-col gap-4 text-center" : "flex-row gap-3.5",
        className,
      )}
      {...props}
    >
      <BasaltMark size={MARK_SIZES[size]} glow={glow} />
      {showWordmark && (
        <BasaltWordmark
          size={WORDMARK_SIZES[size]}
          glow={glow}
          variant={variant}
        />
      )}
    </div>
  );
};
