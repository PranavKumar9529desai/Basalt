import type { CanvasXYNode } from "./mapper";

export interface AlignmentResult {
  x: number;
  y: number;
  verticalLine: number | null;
  horizontalLine: number | null;
  verticalLines: number[];
  horizontalLines: number[];
}

interface NodeBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  right: number;
  bottom: number;
}

function getNodeBounds(node: CanvasXYNode): NodeBounds {
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

  const x = node.position.x;
  const y = node.position.y;

  return {
    id: node.id,
    x,
    y,
    width,
    height,
    centerX: x + width / 2,
    centerY: y + height / 2,
    right: x + width,
    bottom: y + height,
  };
}

/**
 * Calculates magnetic snapping and visual reference guidelines between a dragged node
 * and all other nodes on the canvas. Includes edge, center/middle, and midpoint equal spacing.
 */
export function getSmartGuidelines(
  draggedNode: CanvasXYNode,
  nodes: CanvasXYNode[],
  threshold = 8
): AlignmentResult {
  const d = getNodeBounds(draggedNode);

  const candidateNodes = nodes
    .filter((n) => n.id !== draggedNode.id && !n.selected && !n.id.startsWith("ghost-"))
    .map(getNodeBounds);

  let closestDiffX = threshold;
  let closestDiffY = threshold;
  let snappedX = d.x;
  let snappedY = d.y;

  interface SnapCandidate {
    diff: number;
    snap: number;
    line: number;
  }

  const xCandidates: SnapCandidate[] = [];
  const yCandidates: SnapCandidate[] = [];

  // 1. Single-node alignments (Edge-to-Edge & Center-to-Center / Middle)
  for (const o of candidateNodes) {
    // ─── Vertical Snapping (X-axis alignment) ───
    // Left to Left
    xCandidates.push({ diff: o.x - d.x, snap: o.x, line: o.x });
    // Left to Right
    xCandidates.push({ diff: o.right - d.x, snap: o.right, line: o.right });
    // Center to Center (Middle X)
    xCandidates.push({ diff: o.centerX - d.centerX, snap: o.centerX - d.width / 2, line: o.centerX });
    // Right to Left
    xCandidates.push({ diff: o.x - d.right, snap: o.x - d.width, line: o.x });
    // Right to Right
    xCandidates.push({ diff: o.right - d.right, snap: o.right - d.width, line: o.right });

    // ─── Horizontal Snapping (Y-axis alignment) ───
    // Top to Top
    yCandidates.push({ diff: o.y - d.y, snap: o.y, line: o.y });
    // Top to Bottom
    yCandidates.push({ diff: o.bottom - d.y, snap: o.bottom, line: o.bottom });
    // Center to Center (Middle Y)
    yCandidates.push({ diff: o.centerY - d.centerY, snap: o.centerY - d.height / 2, line: o.centerY });
    // Bottom to Top
    yCandidates.push({ diff: o.y - d.bottom, snap: o.y - d.height, line: o.y });
    // Bottom to Bottom
    yCandidates.push({ diff: o.bottom - d.bottom, snap: o.bottom - d.height, line: o.bottom });
  }

  // 2. Multi-node Midpoint & Equal Spacing Alignments (cap pairs if vault has many nodes)
  const nearbyNodes =
    candidateNodes.length > 40
      ? [...candidateNodes]
          .sort(
            (a, b) =>
              Math.hypot(a.centerX - d.centerX, a.centerY - d.centerY) -
              Math.hypot(b.centerX - d.centerX, b.centerY - d.centerY)
          )
          .slice(0, 30)
      : candidateNodes;

  for (let i = 0; i < nearbyNodes.length; i++) {
    for (let j = i + 1; j < nearbyNodes.length; j++) {
      const o1 = nearbyNodes[i];
      const o2 = nearbyNodes[j];

      // Midpoint between centers (X-axis)
      const midCenterX = (o1.centerX + o2.centerX) / 2;
      xCandidates.push({
        diff: midCenterX - d.centerX,
        snap: midCenterX - d.width / 2,
        line: midCenterX,
      });

      // Equal gap spacing between left node and right node (X-axis)
      const [leftNode, rightNode] = o1.x < o2.x ? [o1, o2] : [o2, o1];
      const targetX = (leftNode.right + (rightNode.x - d.width)) / 2;
      xCandidates.push({
        diff: targetX - d.x,
        snap: targetX,
        line: targetX + d.width / 2,
      });

      // Midpoint between centers (Y-axis)
      const midCenterY = (o1.centerY + o2.centerY) / 2;
      yCandidates.push({
        diff: midCenterY - d.centerY,
        snap: midCenterY - d.height / 2,
        line: midCenterY,
      });

      // Equal gap spacing between top node and bottom node (Y-axis)
      const [topNode, bottomNode] = o1.y < o2.y ? [o1, o2] : [o2, o1];
      const targetY = (topNode.bottom + (bottomNode.y - d.height)) / 2;
      yCandidates.push({
        diff: targetY - d.y,
        snap: targetY,
        line: targetY + d.height / 2,
      });
    }
  }

  // Find best X snapping position
  for (const c of xCandidates) {
    const absDiff = Math.abs(c.diff);
    if (absDiff <= closestDiffX) {
      closestDiffX = absDiff;
      snappedX = c.snap;
    }
  }

  // Find best Y snapping position
  for (const c of yCandidates) {
    const absDiff = Math.abs(c.diff);
    if (absDiff <= closestDiffY) {
      closestDiffY = absDiff;
      snappedY = c.snap;
    }
  }

  // Collect all matching lines at the snapped positions (deduplicated)
  const verticalLinesSet = new Set<number>();
  if (closestDiffX < threshold) {
    for (const c of xCandidates) {
      if (Math.abs(c.snap - snappedX) < 0.5) {
        verticalLinesSet.add(c.line);
      }
    }
  }

  const horizontalLinesSet = new Set<number>();
  if (closestDiffY < threshold) {
    for (const c of yCandidates) {
      if (Math.abs(c.snap - snappedY) < 0.5) {
        horizontalLinesSet.add(c.line);
      }
    }
  }

  const verticalLines = Array.from(verticalLinesSet);
  const horizontalLines = Array.from(horizontalLinesSet);

  return {
    x: snappedX,
    y: snappedY,
    verticalLine: verticalLines[0] ?? null,
    horizontalLine: horizontalLines[0] ?? null,
    verticalLines,
    horizontalLines,
  };
}
