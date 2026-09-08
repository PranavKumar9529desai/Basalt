import type { FC, SVGProps } from "react";
import { useId } from "react";
import { cn } from "../../lib/utils";

export type MarkSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

export interface BasaltMarkProps extends SVGProps<SVGSVGElement> {
  /** Size preset for square mark */
  size?: MarkSize;
  /** Whether the glowing magma conduits are active */
  glow?: boolean;
}

const SIZE_CLASSES: Record<MarkSize, string> = {
  xs: "w-4 h-4",
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-12 h-12",
  xl: "w-16 h-16",
  "2xl": "w-24 h-24",
};

/**
 * BasaltMark — The official geometric Basalt emblem.
 *
 * Depicts the four interconnected polyhedral basalt crystal columns
 * bound by molten volcanic magma conduits.
 */
export const BasaltMark: FC<BasaltMarkProps> = ({
  size = "md",
  glow = true,
  className,
  style,
  ...props
}) => {
  const uid = useId().replace(/:/g, "_");
  const conduitTopRightId = `conduit-top-right-${uid}`;
  const conduitRightBottomId = `conduit-right-bottom-${uid}`;
  const magmaGlowId = `magma-glow-${uid}`;

  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      aria-label="Basalt Emblem"
      className={cn("inline-block select-none shrink-0", SIZE_CLASSES[size], className)}
      style={style}
      {...props}
    >
      <defs>
        <linearGradient
          id={conduitTopRightId}
          x1="100"
          y1="45"
          x2="155"
          y2="85"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#ff3a00" />
          <stop offset="50%" stopColor="#ff7700" />
          <stop offset="100%" stopColor="#ffaa00" />
        </linearGradient>

        <linearGradient
          id={conduitRightBottomId}
          x1="155"
          y1="85"
          x2="120"
          y2="140"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#ffaa00" />
          <stop offset="50%" stopColor="#ff7700" />
          <stop offset="100%" stopColor="#ff3a00" />
        </linearGradient>

        {glow && (
          <filter id={magmaGlowId} x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="4.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        )}
      </defs>

      {/* Magma connectors glow bloom underlayer */}
      {glow && (
        <g filter={`url(#${magmaGlowId})`} opacity={0.75}>
          <line
            x1="100"
            y1="45"
            x2="155"
            y2="85"
            stroke="#ff5500"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <line
            x1="155"
            y1="85"
            x2="120"
            y2="140"
            stroke="#ff5500"
            strokeWidth="9"
            strokeLinecap="round"
          />
        </g>
      )}

      {/* Dark graphite basalt connectors */}
      <line
        x1="100"
        y1="45"
        x2="62"
        y2="100"
        stroke="#232530"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <line
        x1="62"
        y1="100"
        x2="120"
        y2="140"
        stroke="#232530"
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* Molten magma conduits */}
      <line
        x1="100"
        y1="45"
        x2="155"
        y2="85"
        stroke={`url(#${conduitTopRightId})`}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <line
        x1="155"
        y1="85"
        x2="120"
        y2="140"
        stroke={`url(#${conduitRightBottomId})`}
        strokeWidth="4.5"
        strokeLinecap="round"
      />

      {/* 1. Top Hexagonal Basalt Column */}
      <g transform="translate(100, 45)">
        <polygon
          points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11"
          fill="#1b1c22"
          stroke="#2e313d"
          strokeWidth="1.2"
        />
        <polygon points="0,0 19,-11 19,11 0,22" fill="#262833" />
        <polygon points="0,0 0,22 -19,11 -19,-11" fill="#131418" />
        <polygon points="0,0 -19,-11 0,-22 19,-11" fill="#323544" />
        {glow && (
          <line
            x1="0"
            y1="22"
            x2="19"
            y2="11"
            stroke="#ff6a00"
            strokeWidth="1.5"
            opacity={0.8}
          />
        )}
      </g>

      {/* 2. Left Large Basalt Column */}
      <g transform="translate(62, 100) scale(1.38)">
        <polygon
          points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11"
          fill="#1b1c22"
          stroke="#2e313d"
          strokeWidth="1"
        />
        <polygon points="0,0 19,-11 19,11 0,22" fill="#252732" />
        <polygon points="0,0 0,22 -19,11 -19,-11" fill="#111216" />
        <polygon points="0,0 -19,-11 0,-22 19,-11" fill="#2d2f3d" />
      </g>

      {/* 3. Right Basalt Column */}
      <g transform="translate(155, 85)">
        <polygon
          points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11"
          fill="#1b1c22"
          stroke="#2e313d"
          strokeWidth="1.2"
        />
        <polygon points="0,0 19,-11 19,11 0,22" fill="#262833" />
        <polygon points="0,0 0,22 -19,11 -19,-11" fill="#14151a" />
        <polygon points="0,0 -19,-11 0,-22 19,-11" fill="#333646" />
        {glow && (
          <>
            <line
              x1="-19"
              y1="-11"
              x2="0"
              y2="0"
              stroke="#ff6a00"
              strokeWidth="1.5"
              opacity={0.9}
            />
            <line
              x1="0"
              y1="0"
              x2="-19"
              y2="11"
              stroke="#ff6a00"
              strokeWidth="1.5"
              opacity={0.9}
            />
          </>
        )}
      </g>

      {/* 4. Bottom Basalt Column */}
      <g transform="translate(120, 140)">
        <polygon
          points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11"
          fill="#1b1c22"
          stroke="#2e313d"
          strokeWidth="1.2"
        />
        <polygon points="0,0 19,-11 19,11 0,22" fill="#252732" />
        <polygon points="0,0 0,22 -19,11 -19,-11" fill="#121317" />
        <polygon points="0,0 -19,-11 0,-22 19,-11" fill="#303240" />
        {glow && (
          <line
            x1="0"
            y1="-22"
            x2="19"
            y2="-11"
            stroke="#ff6a00"
            strokeWidth="1.5"
            opacity={0.9}
          />
        )}
      </g>
    </svg>
  );
};
