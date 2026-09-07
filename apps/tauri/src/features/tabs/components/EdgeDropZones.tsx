import { createPortal } from "react-dom";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import type { PaneId } from "../types";
import type { useTabDnD } from "../hooks/useTabDnD";
import type { EdgeZone } from "../hooks/useTabDnD";

const ACCENT = "var(--sat-accent-primary)";

/** Preview geometry for an edge drop. The highlight ALWAYS advertises the
 * actual footprint the fresh pane will take: splitLeaf gives both children
 * 0.5/0.5, so a drop creates half of the leaf in the indicated direction
 * (VS Code's editorDropTarget and Obsidian's drop zones do the same). The
 * hit-test wedges that pick the DIRECTION (25%/33%) live in
 * useTabDnD#hitTestDropTarget — preview ≠ hit region, on purpose. The accent
 * line marks the future sash (the inner boundary of the new half). */
export function edgePreview(edge: EdgeZone): {
  region: string;
  line: CSSProperties;
} {
  switch (edge) {
    case "left":
      return {
        region: "inset-y-0 left-0 w-1/2",
        line: { right: 0, top: 0, bottom: 0, width: 3 },
      };
    case "right":
      return {
        region: "inset-y-0 right-0 w-1/2",
        line: { left: 0, top: 0, bottom: 0, width: 3 },
      };
    case "top":
      return {
        region: "inset-x-0 top-0 h-1/2",
        line: { bottom: 0, left: 0, right: 0, height: 3 },
      };
    case "bottom":
      return {
        region: "inset-x-0 bottom-0 h-1/2",
        line: { top: 0, left: 0, right: 0, height: 3 },
      };
  }
}

/** Drop cues for one leaf: portals the highlighted edge footprint / pane-body
 * ring INTO that leaf's content area so `inset-0` maps exactly to the drop
 * region. Rendered for every leaf but only shows its own pane's hover cue. */
export function EdgeDropZones({
  paneId,
  tabDnD,
}: {
  paneId: PaneId;
  tabDnD: ReturnType<typeof useTabDnD>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [bodyEl, setBodyEl] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const section = root.closest<HTMLElement>("section");
    const inner = section?.querySelector<HTMLElement>(
      "[data-basalt-pane-body][data-pane-id]",
    );
    setBodyEl(inner ?? section ?? null);
  }, []);

  const hover = tabDnD.dragState?.hoverTarget;
  const active = Boolean(tabDnD.dragState && hover && hover.paneId === paneId);

  return (
    <>
      <div ref={rootRef} className="hidden" />
      {active && bodyEl && hover
        ? createPortal(
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20"
            >
              {hover.kind === "edge" && <EdgeZoneHighlight edge={hover.edge} />}
              {hover.kind === "pane-body" && <PaneBodyHighlight />}
            </div>,
            bodyEl,
          )
        : null}
    </>
  );
}

function EdgeZoneHighlight({ edge }: { edge: EdgeZone }) {
  const { region, line } = edgePreview(edge);

  return (
    <div
      className={`absolute ${region}`}
      style={{ backgroundColor: ACCENT, opacity: 0.12 }}
    >
      <span
        aria-hidden="true"
        className="absolute"
        style={{ ...line, backgroundColor: ACCENT, borderRadius: 1 }}
      />
    </div>
  );
}

function PaneBodyHighlight() {
  return (
    <div
      className="absolute inset-1 rounded-sm ring-1 ring-inset ring-[var(--sat-accent-primary)] bg-[var(--sat-accent-primary)]/5"
      style={{ opacity: 0.7 }}
    />
  );
}
