import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { resolveCanvasColor } from "../lib/colors";

function CanvasEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const strokeColor =
    (style?.stroke as string) ||
    (data?.color ? resolveCanvasColor(data.color as string) : "var(--sat-accent-primary, #6366f1)");

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ stroke: strokeColor, strokeWidth: 2, ...style }} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)] border border-[var(--sat-layout-border)] rounded px-2 py-0.5 text-xs font-medium shadow-sm"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(CanvasEdge);
