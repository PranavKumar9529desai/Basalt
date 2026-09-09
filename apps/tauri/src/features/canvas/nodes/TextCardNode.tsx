import { memo, useState, useCallback } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { CanvasXYNode } from "../lib/mapper";
import { resolveCanvasColor } from "../lib/colors";
import CardHandles from "./CardHandles";
import { useCanvas } from "../lib/CanvasContext";
import { CanvasCardEditor } from "../components/CanvasCardEditor";

function TextCardNode({ id, data, selected }: NodeProps<CanvasXYNode>) {
  const [isEditing, setIsEditing] = useState(false);
  const canvas = useCanvas();
  const text = (data.text as string) || "";

  const borderColor = resolveCanvasColor(
    data.color as string | undefined,
    "var(--sat-layout-border)",
  );

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  }, []);

  const handleCommit = useCallback(
    (newText: string) => {
      setIsEditing(false);
      canvas.updateText(id, newText);
    },
    [id, canvas],
  );

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  return (
    <div className="group relative w-full h-full">
      <NodeResizer
        minWidth={160}
        minHeight={80}
        isVisible={selected}
        onResizeEnd={() => canvas.saveNow()}
      />
      <CardHandles borderColor={borderColor} selected={selected} />

      <div
        className={`w-full h-full rounded-md border-2 bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)] shadow-sm overflow-hidden flex flex-col ${isEditing ? "cursor-text" : "cursor-grab active:cursor-grabbing"}`}
        style={{ borderColor, contain: "layout style paint" }}
        onDoubleClick={!isEditing ? handleDoubleClick : undefined}
      >
        <div className="flex-1 w-full h-full min-h-0 overflow-hidden">
          <CanvasCardEditor
            text={text}
            isEditing={isEditing}
            onCommit={handleCommit}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </div>
  );
}

export default memo(TextCardNode);
