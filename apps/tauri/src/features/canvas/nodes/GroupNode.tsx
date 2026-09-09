import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { CanvasXYNode } from "../lib/mapper";
import { resolveCanvasColor } from "../lib/colors";
import { useCanvas } from "../lib/CanvasContext";

function GroupNode({ data, selected }: NodeProps<CanvasXYNode>) {
  const canvas = useCanvas();
  const borderColor = resolveCanvasColor(
    data.color as string | undefined,
    "var(--sat-layout-border)",
  );
  const backgroundColor = `${borderColor}1A`; // 10% opacity tint

  return (
    <>
      <NodeResizer
        minWidth={200}
        minHeight={200}
        isVisible={selected}
        onResizeEnd={() => canvas.saveNow()}
      />

      <div
        className="w-full h-full rounded-xl border-2 pointer-events-none"
        style={{
          borderColor,
          backgroundColor,
          contain: "layout style paint",
        }}
      >
        {data.label && (
          <div className="absolute top-0 left-0 -translate-y-full pb-1 px-1">
            <span
              className="px-2 py-1 text-sm font-medium rounded-t-md text-[var(--sat-text-primary)] inline-block pointer-events-auto"
              style={{ backgroundColor: borderColor }}
            >
              {data.label}
            </span>
          </div>
        )}
      </div>
    </>
  );
}

export default memo(GroupNode);
