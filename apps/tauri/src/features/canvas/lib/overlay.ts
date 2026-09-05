// Imperative overlay DOM management for the infinite canvas.
// Positions label divs, selection/hover highlights, side handles, and the
// edge-creation draft line — all without React state.

import type { Scene, SceneNode } from "./scene";
import type { Side } from "./scene";
import type { CanvasTransform } from "@workspace/canvas-viewport";
import { toScreen, sideMidpoint } from "./interaction";
import { extractTitle } from "./scene";

// ─── Overlay DOM refs (bundled for function params) ─────────────────────────

export interface OverlayRefs {
  root: HTMLDivElement | null;
  nodes: Map<string, HTMLElement>;
  container: HTMLDivElement | null;
  handleContainer: HTMLDivElement | null;
  edgeLine: SVGLineElement | null;
}

// ─── Side handles ───────────────────────────────────────────────────────────

export function syncHandles(
  refs: OverlayRefs,
  scene: Scene,
  selected: Set<string>,
  hovered: string | null,
  v: CanvasTransform,
): void {
  const { handleContainer } = refs;
  if (!handleContainer) return;
  handleContainer.innerHTML = "";
  const targetId = hovered ?? (selected.size === 1 ? [...selected][0] : null);
  if (!targetId) return;
  const node = scene.nodes.find((n) => n.id === targetId);
  if (!node) return;
  const sides: Side[] = ["top", "right", "bottom", "left"];
  for (const side of sides) {
    const m = sideMidpoint(node, side, v);
    const circle = document.createElement("div");
    circle.className = "absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2";
    circle.style.cssText =
      `left:${m.x.toFixed(1)}px;top:${m.y.toFixed(1)}px;background:var(--sat-accent-primary);opacity:0.7;border:1px solid rgba(0,0,0,0.3);`;
    handleContainer.appendChild(circle);
  }
}

// ─── Full overlay sync ──────────────────────────────────────────────────────

interface EdgeDraft {
  fx: number; fy: number; tx: number; ty: number;
}

export function syncOverlay(
  refs: OverlayRefs,
  scene: Scene,
  selected: Set<string>,
  hovered: string | null,
  edgeDraft: EdgeDraft | null,
  containerEl: HTMLDivElement | null,
  v: CanvasTransform,
): void {
  const { root, nodes, edgeLine } = refs;
  if (!root || !scene) return;

  const elements = [...scene.groups, ...scene.nodes];
  const activeIds = new Set(elements.map((e) => e.id));
  for (const [id, el] of nodes) {
    if (!activeIds.has(id)) { el.remove(); nodes.delete(id); }
  }

  const cw = containerEl?.clientWidth ?? 800;
  const ch = containerEl?.clientHeight ?? 600;
  const MARGIN = 100;

  for (const el of elements) {
    let div = nodes.get(el.id);
    if (!div) {
      div = document.createElement("div");
      div.className = "canvas-overlay-node absolute select-none overflow-hidden";
      div.style.willChange = "transform";
      div.dataset.nodeId = el.id;
      root.appendChild(div);
      nodes.set(el.id, div);
    }
    const sr = toScreen(el.x, el.y, el.width, el.height, v);
    const visible =
      sr.sx + sr.sw > -MARGIN && sr.sy + sr.sh > -MARGIN &&
      sr.sx < cw + MARGIN && sr.sy < ch + MARGIN;
    if (!visible) { div.style.display = "none"; continue; }
    div.style.display = "";
    div.style.transform = `translate(${sr.sx.toFixed(1)}px,${sr.sy.toFixed(1)}px)`;
    div.style.width = `${sr.sw.toFixed(1)}px`;
    div.style.height = `${sr.sh.toFixed(1)}px`;

    const isSel = selected.has(el.id);
    const isHov = el.id === hovered && !isSel;
    div.classList.toggle("hovered", isHov);
    div.classList.toggle("selected", isSel);

    let html = "";
    if ("label" in el) {
      const lbl = (el as { label?: string }).label;
      if (lbl) {
        html += `<div class="px-2 pt-1 text-xs font-semibold opacity-70" style="color:var(--sat-text-secondary)">${lbl}</div>`;
      }
    }
    if ("type" in el) {
      const node = el as SceneNode;
      if (node.text) {
        html += `<div class="px-3 pt-2 text-sm leading-snug" style="color:var(--sat-text-primary)">${extractTitle(node.text)}</div>`;
      }
      if (node.type === "file") {
        html += `<div class="px-3 pt-2 text-sm opacity-60" style="color:var(--sat-text-secondary)">📄 file</div>`;
      }
      if (node.type === "link") {
        html += `<div class="px-3 pt-2 text-sm opacity-60" style="color:var(--sat-text-secondary)">🔗 link</div>`;
      }
    }
    div.innerHTML = html;
  }

  syncHandles(refs, scene, selected, hovered, v);

  // Edge draft line.
  if (edgeLine && edgeDraft) {
    edgeLine.setAttribute("x1", String(edgeDraft.fx * v.scale + v.ox));
    edgeLine.setAttribute("y1", String(edgeDraft.fy * v.scale + v.oy));
    edgeLine.setAttribute("x2", String(edgeDraft.tx * v.scale + v.ox));
    edgeLine.setAttribute("y2", String(edgeDraft.ty * v.scale + v.oy));
    edgeLine.style.display = "";
  } else if (edgeLine) {
    edgeLine.style.display = "none";
  }
}
