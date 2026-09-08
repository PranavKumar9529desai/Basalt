import { basename } from "./filters";
import { LABEL_CAP, LABEL_SCALE, NODE_R } from "./geometry";

export interface OverlayLabelsOptions {
  canvasW: number;
  canvasH: number;
  /** Per-node [x, y] world positions of the active subset. */
  positions: Float32Array;
  count: number;
  /** Subset index → full-graph index mapping. */
  map: number[];
  /** Active (hovered) subset index, or -1. */
  hoverIndex: number;
  /** Full-graph indices of the hovered node's neighbors (subset-relative). */
  neighbors: number[] | null;
  project: (wx: number, wy: number) => [number, number];
  isTag: boolean[];
  paths: string[];
  labelColor: string;
  scale: number;
}

/** Draw the label overlay onto the transparent 2D canvas above the WebGL
 * view. The focused node's neighborhood is always labeled (Obsidian
 * behavior); outside hover, labels appear once the user zooms in.
 * `LABEL_CAP` stays as a hard safety bound either way. */
export function drawOverlayLabels(
  ctx: CanvasRenderingContext2D,
  opts: OverlayLabelsOptions,
): void {
  const {
    canvasW,
    canvasH,
    positions,
    count,
    map,
    hoverIndex,
    neighbors,
    project,
    isTag,
    paths,
    labelColor,
    scale,
  } = opts;

  ctx.clearRect(0, 0, canvasW, canvasH);
  const neighborSet = neighbors ? new Set(neighbors) : null;
  const hoverMode = hoverIndex >= 0;
  const showLabels =
    count < LABEL_CAP && (hoverMode || scale > LABEL_SCALE);
  if (!showLabels) return;

  ctx.font = "10px system-ui, sans-serif";
  ctx.fillStyle = labelColor;
  for (let i = 0; i < count; i++) {
    if (i * 2 + 1 >= positions.length) break;
    const full = map[i];
    const [px, py] = project(positions[i * 2], positions[i * 2 + 1]);
    const related =
      hoverMode && (i === hoverIndex || (neighborSet && neighborSet.has(i)));
    if (hoverMode && !related) continue;
    ctx.globalAlpha = 1;
    const lbl = isTag[full]
      ? `#${paths[full] ?? ""}`
      : basename(paths[full] ?? "");
    ctx.fillText(lbl, px + NODE_R + 2, py + 3);
  }
  ctx.globalAlpha = 1;
}