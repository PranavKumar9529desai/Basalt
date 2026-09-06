import { memo } from "react";
import { useViewport } from "@xyflow/react";

interface GuidelineLinesProps {
  verticalLine: number | null;
  horizontalLine: number | null;
}

function GuidelineLines({ verticalLine, horizontalLine }: GuidelineLinesProps) {
  const { x, y, zoom } = useViewport();

  if (verticalLine === null && horizontalLine === null) {
    return null;
  }

  const screenX = verticalLine !== null ? verticalLine * zoom + x : null;
  const screenY = horizontalLine !== null ? horizontalLine * zoom + y : null;

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-30">
      {screenX !== null && (
        <line
          x1={screenX}
          y1={0}
          x2={screenX}
          y2="100%"
          stroke="var(--sat-accent-primary, #6366f1)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
      )}
      {screenY !== null && (
        <line
          x1={0}
          y1={screenY}
          x2="100%"
          y2={screenY}
          stroke="var(--sat-accent-primary, #6366f1)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
      )}
    </svg>
  );
}

export default memo(GuidelineLines);
