import type { CanvasXYNode } from "./mapper";

export interface AlignmentResult {
  x: number;
  y: number;
  verticalLine: number | null;
  horizontalLine: number | null;
}

function getNodeDimensions(node: CanvasXYNode): { width: number; height: number } {
  const measuredWidth = (node as any).measured?.width;
  const measuredHeight = (node as any).measured?.height;

  const nodeWidth = (node as any).width;
  const nodeHeight = (node as any).height;

  const styleWidth =
    typeof node.style?.width === "number"
      ? node.style.width
      : parseInt(String(node.style?.width));
  const styleHeight =
    typeof node.style?.height === "number"
      ? node.style.height
      : parseInt(String(node.style?.height));

  const width =
    (typeof measuredWidth === "number" && measuredWidth > 0 ? measuredWidth : undefined) ??
    (typeof nodeWidth === "number" && nodeWidth > 0 ? nodeWidth : undefined) ??
    (!isNaN(styleWidth) && styleWidth > 0 ? styleWidth : undefined) ??
    250;

  const height =
    (typeof measuredHeight === "number" && measuredHeight > 0 ? measuredHeight : undefined) ??
    (typeof nodeHeight === "number" && nodeHeight > 0 ? nodeHeight : undefined) ??
    (!isNaN(styleHeight) && styleHeight > 0 ? styleHeight : undefined) ??
    140;

  return { width, height };
}

/**
 * Calculates magnetic snapping and visual reference guidelines between a dragged node
 * and all other nodes on the canvas.
 */
export function getSmartGuidelines(
  draggedNode: CanvasXYNode,
  nodes: CanvasXYNode[],
  threshold = 8
): AlignmentResult {
  const { width: dWidth, height: dHeight } = getNodeDimensions(draggedNode);
  const dX = draggedNode.position.x;
  const dY = draggedNode.position.y;

  let closestDiffX = threshold;
  let closestDiffY = threshold;
  let snappedX = dX;
  let snappedY = dY;
  let verticalLine: number | null = null;
  let horizontalLine: number | null = null;

  for (const other of nodes) {
    if (other.id === draggedNode.id || other.selected || other.id.startsWith("ghost-")) {
      continue;
    }

    const { width: oWidth, height: oHeight } = getNodeDimensions(other);
    const oX = other.position.x;
    const oY = other.position.y;

    // ─── Vertical Snapping (X-axis alignment) ───────────────────────────
    const xAlignments = [
      // Left to Left
      { diff: oX - dX, line: oX, snap: oX },
      // Left to Right
      { diff: oX + oWidth - dX, line: oX + oWidth, snap: oX + oWidth },
      // Center to Center
      {
        diff: oX + oWidth / 2 - (dX + dWidth / 2),
        line: oX + oWidth / 2,
        snap: oX + oWidth / 2 - dWidth / 2,
      },
      // Right to Left
      { diff: oX - (dX + dWidth), line: oX, snap: oX - dWidth },
      // Right to Right
      { diff: oX + oWidth - (dX + dWidth), line: oX + oWidth, snap: oX + oWidth - dWidth },
    ];

    for (const align of xAlignments) {
      const absDiff = Math.abs(align.diff);
      if (absDiff <= closestDiffX) {
        closestDiffX = absDiff;
        snappedX = align.snap;
        verticalLine = align.line;
      }
    }

    // ─── Horizontal Snapping (Y-axis alignment) ─────────────────────────
    const yAlignments = [
      // Top to Top
      { diff: oY - dY, line: oY, snap: oY },
      // Top to Bottom
      { diff: oY + oHeight - dY, line: oY + oHeight, snap: oY + oHeight },
      // Center to Center
      {
        diff: oY + oHeight / 2 - (dY + dHeight / 2),
        line: oY + oHeight / 2,
        snap: oY + oHeight / 2 - dHeight / 2,
      },
      // Bottom to Top
      { diff: oY - (dY + dHeight), line: oY, snap: oY - dHeight },
      // Bottom to Bottom
      { diff: oY + oHeight - (dY + dHeight), line: oY + oHeight, snap: oY + oHeight - dHeight },
    ];

    for (const align of yAlignments) {
      const absDiff = Math.abs(align.diff);
      if (absDiff <= closestDiffY) {
        closestDiffY = absDiff;
        snappedY = align.snap;
        horizontalLine = align.line;
      }
    }
  }

  return {
    x: snappedX,
    y: snappedY,
    verticalLine,
    horizontalLine,
  };
}
