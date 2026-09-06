import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { CanvasXYNode } from "../lib/mapper";
import { resolveCanvasColor } from "../lib/colors";
import CardHandles from "./CardHandles";

function FileNode({ data, selected }: NodeProps<CanvasXYNode>) {
  const borderColor = resolveCanvasColor(data.color as string | undefined, "var(--sat-layout-border)");

  return (
    <div className="group relative w-full h-full">
      <NodeResizer minWidth={120} minHeight={60} isVisible={selected} />
      <CardHandles borderColor={borderColor} selected={selected} />

      <div 
        className="w-full h-full rounded-md border-2 bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)] shadow-sm flex items-center justify-center cursor-pointer hover:bg-[var(--sat-surface-2)] transition-colors cursor-grab active:cursor-grabbing"
        style={{ borderColor, contain: "layout style paint" }}
        onDoubleClick={() => {
          // Open note in tab
          console.log("Opening file", data.file);
        }}
      >
        <div className="flex flex-col items-center gap-2 p-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--sat-text-secondary)]"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span className="text-sm font-medium truncate max-w-full px-2" title={data.file as string}>
            {data.file}
          </span>
          {data.subpath && (
            <span className="text-xs text-[var(--sat-text-secondary)] truncate max-w-full px-2">
              {data.subpath}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(FileNode);
