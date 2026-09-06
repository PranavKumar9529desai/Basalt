import { memo, useMemo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { IconWorld, IconExternalLink } from "@tabler/icons-react";
import type { CanvasXYNode } from "../lib/mapper";
import { resolveCanvasColor } from "../lib/colors";
import CardHandles from "./CardHandles";
import { useCanvas } from "../CanvasContext";

function LinkNode({ data, selected }: NodeProps<CanvasXYNode>) {
  const canvas = useCanvas();
  const url = (data.url as string) || "";
  const color = data.color as string | undefined;
  const borderColor = resolveCanvasColor(color, "var(--sat-layout-border)");

  const domain = useMemo(() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }, [url]);

  const handleOpen = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!url) return;
    window.open(url, "_blank");
  };

  return (
    <div className="group relative w-full h-full">
      <NodeResizer minWidth={180} minHeight={80} isVisible={selected} onResizeEnd={() => canvas.saveNow()} />
      <CardHandles borderColor={borderColor} selected={selected} />

      <div
        className="w-full h-full rounded-md border-2 bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)] shadow-sm overflow-hidden flex flex-col cursor-pointer hover:border-[var(--sat-accent-primary)] transition-colors"
        style={{ borderColor, contain: "layout style paint" }}
        onDoubleClick={handleOpen}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)]/60 select-none">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <IconWorld size={16} className="text-[var(--sat-accent-blue)] shrink-0" />
            <span className="text-xs font-semibold truncate text-[var(--sat-text-primary)]">
              {domain}
            </span>
          </div>
          <button
            type="button"
            onClick={handleOpen}
            className="p-1 rounded text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] transition-colors shrink-0"
            title="Open in browser"
          >
            <IconExternalLink size={13} />
          </button>
        </div>

        {/* URL Body */}
        <div className="flex-1 p-3 flex flex-col justify-center overflow-hidden">
          <span className="text-xs text-[var(--sat-text-secondary)] font-mono truncate max-w-full" title={url}>
            {url}
          </span>
          <span className="text-[10px] text-[var(--sat-text-muted)] mt-1">
            Double-click card to visit
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(LinkNode);
