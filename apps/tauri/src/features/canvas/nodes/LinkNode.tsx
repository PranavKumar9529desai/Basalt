import { memo, useMemo, useState, useRef, useEffect, useCallback } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import {
  IconWorld,
  IconExternalLink,
  IconPencil,
  IconCheck,
} from "@tabler/icons-react";
import type { CanvasXYNode } from "../lib/mapper";
import { resolveCanvasColor } from "../lib/colors";
import CardHandles from "./CardHandles";
import { useCanvas } from "../lib/CanvasContext";

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function LinkNode({ id, data, selected }: NodeProps<CanvasXYNode>) {
  const canvas = useCanvas();
  const url = (data.url as string) || "";
  const color = data.color as string | undefined;
  const borderColor = resolveCanvasColor(color, "var(--sat-layout-border)");

  // If newly created with empty or default placeholder, start in edit mode
  const [isEditing, setIsEditing] = useState(url === "" || url === "https://");
  const [inputUrl, setInputUrl] = useState(url);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputUrl(url);
  }, [url]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const domain = useMemo(() => {
    try {
      const parsed = new URL(url);
      return parsed.hostname || url;
    } catch {
      return url.replace(/^https?:\/\//, "").split("/")[0] || url;
    }
  }, [url]);

  const hasValidUrl =
    url.trim() !== "" && url.trim() !== "https://" && url.trim() !== "http://";

  const commitUrl = useCallback(() => {
    setIsEditing(false);
    const normalized = normalizeUrl(inputUrl);
    if (normalized !== url) {
      canvas.updateUrl(id, normalized);
    }
  }, [id, inputUrl, url, canvas]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitUrl();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsEditing(false);
        setInputUrl(url);
      }
    },
    [commitUrl, url],
  );

  const handleOpen = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!url || url === "https://") {
      setIsEditing(true);
      return;
    }
    window.open(url, "_blank");
  };

  const startEditing = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsEditing(true);
  };

  return (
    <div className="group relative w-full h-full">
      <NodeResizer
        minWidth={180}
        minHeight={80}
        isVisible={selected}
        onResizeEnd={() => canvas.saveNow()}
      />
      <CardHandles borderColor={borderColor} selected={selected} />

      <div
        className="w-full h-full rounded-md border-2 bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)] shadow-sm overflow-hidden flex flex-col transition-colors"
        style={{ borderColor, contain: "layout style paint" }}
      >
        {/* Header bar */}
        <div
          className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)]/60 select-none cursor-grab active:cursor-grabbing"
          onDoubleClick={startEditing}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <IconWorld
              size={15}
              className="text-[var(--sat-accent-blue)] shrink-0"
            />
            <span className="text-xs font-semibold truncate text-[var(--sat-text-primary)]">
              {domain || "Web Link"}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isEditing ? (
              <button
                type="button"
                onClick={commitUrl}
                className="p-1 rounded text-[var(--sat-accent-primary)] hover:bg-[var(--sat-surface-3)] transition-colors"
                title="Done"
              >
                <IconCheck size={13} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={startEditing}
                  className="p-1 rounded text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] transition-colors"
                  title="Edit URL"
                >
                  <IconPencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={handleOpen}
                  className="p-1 rounded text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] transition-colors"
                  title="Open in browser"
                >
                  <IconExternalLink size={13} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* URL Body / Live Web Preview */}
        <div className="flex-1 w-full h-full overflow-hidden flex flex-col relative">
          {isEditing ? (
            <div className="p-3 flex flex-col justify-center gap-1 w-full h-full">
              <input
                ref={inputRef}
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={commitUrl}
                onDoubleClick={(e) => e.stopPropagation()}
                placeholder="https://example.com"
                className="w-full text-xs font-mono px-2 py-1.5 rounded border border-[var(--sat-accent-primary)] bg-[var(--sat-surface-0)] text-[var(--sat-text-primary)] outline-none"
              />
              <span className="text-[10px] text-[var(--sat-text-muted)]">
                Press Enter to save, Escape to cancel
              </span>
            </div>
          ) : hasValidUrl ? (
            <div className="relative w-full h-full flex-1 overflow-hidden bg-[var(--sat-surface-0)]">
              <iframe
                src={url}
                title={domain || "Embedded Webpage"}
                className={`w-full h-full border-0 ${selected ? "pointer-events-auto" : "pointer-events-none"}`}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                loading="lazy"
              />
              {/* When card is not selected, this transparent shield lets user pan canvas and drag card freely */}
              {!selected && (
                <div
                  className="absolute inset-0 z-10 bg-transparent cursor-pointer"
                  onDoubleClick={startEditing}
                  title="Click to select card · Double-click to edit URL"
                />
              )}
            </div>
          ) : (
            <div
              className="flex-1 p-3 flex flex-col justify-center items-center cursor-pointer text-center"
              onDoubleClick={startEditing}
            >
              <span className="text-xs text-[var(--sat-text-muted)]">
                Double-click to set website URL
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(LinkNode);
