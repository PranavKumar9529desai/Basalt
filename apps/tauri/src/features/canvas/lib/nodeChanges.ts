import type { NodeChange } from "@xyflow/react";
import type { CanvasXYNode } from "./mapper";
import type { GuidelinesState } from "../hooks/useCanvasGuidelines";
import { getSmartGuidelines } from "./guidelines";

export interface SnapResult {
  nextChanges: NodeChange[];
  hasSnapChange: boolean;
  /** Non-null when a dragging node snapped to an alignment guideline. */
  guidelines: GuidelinesState | null;
}

/**
 * Apply smart-guideline snapping to dragging position changes: the dragged
 * node's position is corrected to the nearest alignment, and the guideline
 * lines for the renderer are derived. Pure — the caller owns dispatching the
 * guideline state (and clearing it when nothing snapped).
 */
export function applySnapChanges(
  changes: NodeChange[],
  nds: CanvasXYNode[],
): SnapResult {
  let hasSnapChange = false;
  let guidelines: GuidelinesState | null = null;
  const nextChanges = changes.map((change) => {
    if (change.type === "position" && change.dragging && change.position) {
      const node = nds.find((n) => n.id === change.id);
      if (node) {
        const tempNode: CanvasXYNode = {
          ...node,
          position: change.position,
        };
        const alignment = getSmartGuidelines(tempNode, nds);
        hasSnapChange = true;
        guidelines = {
          vertical: alignment.verticalLine,
          horizontal: alignment.horizontalLine,
          verticalLines: alignment.verticalLines,
          horizontalLines: alignment.horizontalLines,
        };
        return {
          ...change,
          position: { x: alignment.x, y: alignment.y },
        };
      }
    }
    return change;
  });
  return { nextChanges, hasSnapChange, guidelines };
}

/** Sync each node's style width/height whenever a dimensions change reports
 * a new measured size (resize stays in sync even without a re-render). */
export function syncDimensions(
  nextNodes: CanvasXYNode[],
  changes: NodeChange[],
): void {
  for (const change of changes) {
    if (change.type === "dimensions" && change.dimensions) {
      const target = nextNodes.find((n) => n.id === change.id);
      if (target) {
        const newW = Math.round(change.dimensions.width);
        const newH = Math.round(change.dimensions.height);
        target.style = {
          ...target.style,
          width: newW,
          height: newH,
        };
        target.measured = {
          width: newW,
          height: newH,
        };
      }
    }
  }
}

/** Whether a change batch represents a real document edit (drag, resize,
 * add/remove) as opposed to selection, initial measure, or mid-gesture
 * noise — the save trigger for node changes. */
export function shouldTriggerSave(changes: NodeChange[]): boolean {
  const isDragging = changes.some((c) => c.type === "position" && c.dragging);
  const isResizing = changes.some(
    (c) => c.type === "dimensions" && c.resizing === true,
  );
  const isPureSelect = changes.every((c) => c.type === "select");
  const isInitialDimensions = changes.every(
    (c) => c.type === "dimensions" && !c.resizing,
  );
  return !isDragging && !isResizing && !isPureSelect && !isInitialDimensions;
}