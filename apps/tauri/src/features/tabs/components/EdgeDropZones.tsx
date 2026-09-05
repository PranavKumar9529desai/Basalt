import { type DragEvent, useRef, useState } from "react";
import type { PaneId } from "../types";
import type { useTabDnD } from "../hooks/useTabDnD";
import type { EdgeZone } from "../hooks/useTabDnD";

interface ZoneSpec {
  edge: EdgeZone;
  className: string;
}

// Equal wedge zones over each leaf. The strip hitboxes overlap at the corners;
// the LAST matching zone under the cursor wins for a drop, which is fine — all
// four are valid Obsidian-style creation targets.
const ZONES: ZoneSpec[] = [
  { edge: "left", className: "left-0 top-0 bottom-0 w-1/4" },
  { edge: "right", className: "right-0 top-0 bottom-0 w-1/4" },
  { edge: "top", className: "top-0 left-1/4 right-1/4 h-1/3" },
  { edge: "bottom", className: "bottom-0 left-1/4 right-1/4 h-1/3" },
];

const ACCENT = "var(--sat-accent-primary)";

export function EdgeDropZones({
  paneId,
  tabDnD,
}: {
  paneId: PaneId;
  tabDnD: ReturnType<typeof useTabDnD>;
}) {
  if (!tabDnD.isDraggingTab) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {ZONES.map(({ edge, className }) => (
        <EdgeZoneStrip
          key={edge}
          edge={edge}
          className={className}
          paneId={paneId}
          onEdgeDrop={tabDnD.handleEdgeDrop}
        />
      ))}
    </div>
  );
}

function EdgeZoneStrip({
  edge,
  className,
  paneId,
  onEdgeDrop,
}: {
  edge: EdgeZone;
  className: string;
  paneId: PaneId;
  onEdgeDrop: (
    edge: EdgeZone,
    paneId: string,
    event: DragEvent<HTMLElement>,
  ) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const depth = useRef(0);

  const onDragEnter = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    depth.current += 1;
    setHovered(true);
  };
  const onDragLeave = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setHovered(false);
  };
  const onDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setHovered(true);
  };

  const edgeLine =
    edge === "left"
      ? { left: 0, top: 0, bottom: 0, width: 3 }
      : edge === "right"
        ? { right: 0, top: 0, bottom: 0, width: 3 }
        : edge === "top"
          ? { top: 0, left: 0, right: 0, height: 3 }
          : { bottom: 0, left: 0, right: 0, height: 3 };

  return (
    <div
      data-edge={edge}
      className={`pointer-events-auto absolute ${className}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => onEdgeDrop(edge, paneId, e)}
      style={{
        backgroundColor: hovered ? ACCENT : undefined,
        opacity: hovered ? 0.12 : 0,
        transition: "opacity 80ms linear",
      }}
    >
      {hovered && (
        <span
          aria-hidden="true"
          className="absolute"
          style={{ ...edgeLine, backgroundColor: ACCENT, borderRadius: 1 }}
        />
      )}
    </div>
  );
}