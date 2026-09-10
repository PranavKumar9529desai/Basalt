import { memo } from "react";
import { useViewport } from "@xyflow/react";

interface GuidelineLinesProps {
  verticalLine?: number | null;
  horizontalLine?: number | null;
  verticalLines?: number[];
  horizontalLines?: number[];
}

function GuidelineLinesInner({
  verticalLine,
  horizontalLine,
  verticalLines = [],
  horizontalLines = [],
}: GuidelineLinesProps) {
  const { x, y, zoom } = useViewport();

  const vLines =
    verticalLines.length > 0
      ? verticalLines
      : verticalLine !== null && verticalLine !== undefined
        ? [verticalLine]
        : [];

  const hLines =
    horizontalLines.length > 0
      ? horizontalLines
      : horizontalLine !== null && horizontalLine !== undefined
        ? [horizontalLine]
        : [];

  if (vLines.length === 0 && hLines.length === 0) {
    return null;
  }

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-30">
      {vLines.map((v, idx) => {
        const screenX = v * zoom + x;
        return (
          <line
            key={`v-${idx}-${v}`}
            x1={screenX}
            y1={0}
            x2={screenX}
            y2="100%"
            stroke="var(--sat-accent-primary, #6366f1)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        );
      })}
      {hLines.map((h, idx) => {
        const screenY = h * zoom + y;
        return (
          <line
            key={`h-${idx}-${h}`}
            x1={0}
            y1={screenY}
            x2="100%"
            y2={screenY}
            stroke="var(--sat-accent-primary, #6366f1)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        );
      })}
    </svg>
  );
}

export const GuidelineLines = memo(GuidelineLinesInner);
