import { memo, useState, useCallback, useEffect, useRef } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { CanvasXYNode } from "../lib/mapper";
import { resolveCanvasColor } from "../lib/colors";
import CardHandles from "./CardHandles";

function TextCardNode({ data, selected }: NodeProps<CanvasXYNode>) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(data.text || "");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const borderColor = resolveCanvasColor(data.color as string | undefined, "var(--sat-layout-border)");

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsEditing(false);
    }
  }, []);

  return (
    <div className="group relative w-full h-full">
      <NodeResizer minWidth={160} minHeight={80} isVisible={selected} />
      <CardHandles borderColor={borderColor} selected={selected} />

      <div 
        className="w-full h-full rounded-md border-2 bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)] shadow-sm overflow-hidden flex flex-col cursor-grab active:cursor-grabbing"
        style={{ borderColor, contain: "layout style paint" }}
        onDoubleClick={handleDoubleClick}
      >
        <div className="h-3 w-full opacity-40" style={{ backgroundColor: borderColor }} />
        
        <div className="flex-1 p-3 overflow-y-auto w-full h-full">
          {isEditing ? (
            <textarea
              ref={inputRef}
              className="w-full h-full bg-transparent resize-none outline-none focus:outline-none"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <div className="whitespace-pre-wrap select-none">{text}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(TextCardNode);
