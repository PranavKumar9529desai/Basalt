import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { CanvasXYNode } from "../lib/mapper";
import { resolveCanvasColor } from "../lib/colors";
import CardHandles from "./CardHandles";

function LinkNode({ data, selected }: NodeProps<CanvasXYNode>) {
  const borderColor = resolveCanvasColor(data.color as string | undefined, "var(--sat-layout-border)");

  return (
    <div className="group relative w-full h-full">
      <NodeResizer minWidth={200} minHeight={100} isVisible={selected} />
      <CardHandles borderColor={borderColor} selected={selected} />

      <div 
        className="w-full h-full rounded-md border-2 bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)] shadow-sm flex flex-col items-center justify-center cursor-pointer hover:bg-[var(--sat-surface-2)] transition-colors p-4 cursor-grab active:cursor-grabbing"
        style={{ borderColor, contain: "layout style paint" }}
        onDoubleClick={() => {
          if (data.url) window.open(data.url as string, "_blank");
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2 text-[var(--sat-accent-blue)]"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        <span className="text-sm font-medium text-center truncate w-full" title={data.url as string}>
          {data.url}
        </span>
      </div>
    </div>
  );
}

export default memo(LinkNode);
