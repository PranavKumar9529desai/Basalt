import type { FC, SVGProps } from "react";
import { useId } from "react";
import { cn } from "../../lib/utils";

export type WordmarkSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
export type WordmarkVariant = "default" | "white" | "dark" | "monochrome";

export interface BasaltWordmarkProps extends SVGProps<SVGSVGElement> {
  /** Size preset for wordmark height */
  size?: WordmarkSize;
  /** Whether the glowing magma ember inside the first 'A' is illuminated */
  glow?: boolean;
  /** Color variant. 'default' inherits currentColor from surrounding text */
  variant?: WordmarkVariant;
}

const SIZE_CLASSES: Record<WordmarkSize, string> = {
  xs: "h-3.5",
  sm: "h-4.5",
  md: "h-6",
  lg: "h-9",
  xl: "h-12",
  "2xl": "h-16",
};

const VARIANT_COLORS: Record<WordmarkVariant, string | undefined> = {
  default: "currentColor",
  white: "#f2f4f8",
  dark: "#0d0e12",
  monochrome: "currentColor",
};

/**
 * BasaltWordmark — The official geometric Basalt wordmark.
 *
 * Reproduces the custom display typography with inverted chevrons ('Λ')
 * and an atmospheric molten magma orange ember radiating from inside
 * the first 'A'.
 *
 * Implemented as pure vector SVG for infinite resolution, sub-millisecond
 * rendering, and native theme-adaptability via `currentColor`.
 */
export const BasaltWordmark: FC<BasaltWordmarkProps> = ({
  size = "md",
  glow = true,
  variant = "default",
  className,
  style,
  ...props
}) => {
  const uid = useId().replace(/:/g, "_");
  const gradientId = `basalt-magma-glow-${uid}`;
  const filterId = `basalt-ember-blur-${uid}`;
  const fillColor = VARIANT_COLORS[variant];
  const isMonochrome = variant === "monochrome" || !glow;

  return (
    <svg
      viewBox="0 0 1020 130"
      fill="none"
      aria-label="Basalt"
      className={cn(
        "w-auto inline-block select-none",
        SIZE_CLASSES[size],
        className,
      )}
      style={style}
      {...props}
    >
      <defs>
        {!isMonochrome && (
          <>
            {/* Magma orange ember glow inside the apex of the first 'A' */}
            <radialGradient
              id={gradientId}
              cx="50%"
              cy="10%"
              r="90%"
              fx="50%"
              fy="10%"
            >
              <stop offset="0%" stopColor="#ff3a00" stopOpacity="1" />
              <stop offset="35%" stopColor="#ff6a00" stopOpacity="0.95" />
              <stop offset="70%" stopColor="#ff9900" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ff7700" stopOpacity="0" />
            </radialGradient>
            <filter id={filterId} x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </>
        )}
      </defs>

      <g transform="translate(0, 130) scale(0.1, -0.1)" stroke="none">
        {/* Inner glowing ember core in the crotch of the first 'A' */}
        {!isMonochrome && (
          <path
            d="M2550 780 L2340 280 L2860 280 Z"
            fill={`url(#${gradientId})`}
            filter={`url(#${filterId})`}
          />
        )}

        {/* B */}
        <path
          fill={fillColor}
          d="M125 1208 c-3 -7 -4 -260 -3 -563 l3 -550 560 0 c514 0 564 1 612 18 80 28 127 68 159 134 25 49 29 72 32 161 3 65 0 120 -9 149 -15 54 -67 111 -110 120 -26 5 -42 23 -20 23 20 0 75 56 92 95 24 53 26 208 3 263 -33 81 -109 134 -215 152 -98 15 -1098 14 -1104 -2z m971 -269 c29 -32 26 -105 -5 -130 -22 -18 -43 -19 -317 -19 l-294 0 0 85 0 85 298 0 c291 0 299 -1 318 -21z m4 -399 c27 -15 43 -81 31 -126 -18 -64 -14 -63 -348 -64 l-303 0 0 100 0 100 301 0 c184 0 308 -4 319 -10z"
        />
        {/* First 'A' (inverted chevron with magma crotch) */}
        <path
          fill={fillColor}
          d="M2488 1198 c-24 -37 -410 -674 -545 -898 l-123 -205 189 -3 c266 -4 261 -6 369 163 132 208 224 365 232 399 11 43 49 126 59 126 4 0 18 -31 30 -69 15 -46 75 -154 181 -327 194 -315 162 -294 438 -294 100 0 182 2 182 5 0 2 -47 84 -105 182 -58 98 -205 349 -328 558 l-223 380 -171 3 c-168 2 -171 2 -185 -20z"
        />
        {/* S */}
        <path
          fill={fillColor}
          d="M4250 1219 c-170 -6 -225 -24 -288 -93 -57 -62 -76 -128 -76 -261 0 -137 16 -188 80 -243 78 -70 117 -76 526 -82 355 -5 358 -5 380 -28 33 -32 33 -122 0 -154 -22 -23 -27 -23 -294 -26 -315 -3 -323 -2 -339 64 l-11 44 -170 0 -170 0 4 -83 c4 -101 32 -165 91 -208 81 -59 106 -62 515 -67 236 -2 404 0 455 7 113 15 195 56 236 118 45 67 55 113 55 243 -1 136 -22 200 -85 254 -76 65 -103 69 -512 76 -362 6 -368 6 -390 28 -32 32 -31 112 1 144 22 23 28 23 276 26 295 4 320 -1 332 -62 l6 -36 170 0 171 0 -5 70 c-10 133 -77 222 -192 255 -57 16 -510 24 -766 14z"
        />
        {/* Second 'A' (unbarred chevron matching first 'A') */}
        <path
          fill={fillColor}
          d="M6192 1193 c-27 -40 -414 -694 -615 -1040 l-36 -63 188 0 189 0 148 248 c81 136 181 304 223 374 41 70 77 125 80 122 3 -2 100 -170 217 -372 l212 -367 186 -3 c102 -1 186 1 186 6 0 7 -302 536 -562 985 l-80 137 -158 0 -159 0 -19 -27z"
        />
        {/* L */}
        <path
          fill={fillColor}
          d="M7560 655 l0 -565 548 2 547 3 0 130 0 130 -372 3 -373 2 0 430 0 430 -175 0 -175 0 0 -565z"
        />
        {/* T */}
        <path
          fill={fillColor}
          d="M8800 1085 l0 -135 230 0 230 0 0 -430 0 -430 180 0 180 0 0 430 0 430 230 0 230 0 0 135 0 135 -640 0 -640 0 0 -135z"
        />
      </g>
    </svg>
  );
};
