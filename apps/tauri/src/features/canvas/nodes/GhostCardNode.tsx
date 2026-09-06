import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CanvasXYNode } from "../lib/mapper";

function GhostCardNode({ data }: NodeProps<CanvasXYNode>) {
  const onCommit = data?.onCommit as (() => void) | undefined;

  return (
    <div className="relative w-full h-full">
      {/* Target handle so connection line connects to ghost card */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-3 !h-3 !rounded-full !border-2 !border-[var(--sat-accent-primary)] !bg-[var(--sat-surface-1)] opacity-80"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-3 !h-3 !rounded-full !border-2 !border-[var(--sat-accent-primary)] !bg-[var(--sat-surface-1)] opacity-80"
      />

      <button
        type="button"
        className="w-full h-full rounded-md border-2 border-dashed border-[var(--sat-accent-primary)] bg-[var(--sat-surface-1)]/70 text-[var(--sat-text-primary)] shadow-md flex flex-col items-center justify-center p-3 cursor-pointer hover:bg-[var(--sat-surface-2)]/90 transition-all hover:scale-[1.02] backdrop-blur-sm group outline-none"
        onClick={() => onCommit?.()}
      >
        <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--sat-accent-primary)]">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span>Click to create card</span>
        </div>
        <span className="text-xs text-[var(--sat-text-muted)] mt-1">or click outside to cancel</span>
      </button>
    </div>
  );
}

export default memo(GhostCardNode);
