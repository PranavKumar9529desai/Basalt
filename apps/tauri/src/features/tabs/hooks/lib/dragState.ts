import type { DragEvent } from "react";

export type EdgeZone = "left" | "right" | "top" | "bottom";

export interface EdgeSplit {
  orientation: "horizontal" | "vertical";
  placement: "before" | "after";
}

/** Map an edge-drop zone to the split it creates (ADR-032 Phase 7):
 * left/right split the pane into columns, top/bottom into rows; "before"
 * lands the fresh pane left/above, "after" right/below. */
export function edgeToSplit(edge: EdgeZone): EdgeSplit {
  switch (edge) {
    case "left":
      return { orientation: "horizontal", placement: "before" };
    case "right":
      return { orientation: "horizontal", placement: "after" };
    case "top":
      return { orientation: "vertical", placement: "before" };
    case "bottom":
      return { orientation: "vertical", placement: "after" };
  }
}

export interface DraggedTabState {
  tabId: string;
  sourcePaneId: string;
}

/** The pointer-drag hover target (ADR-032 Phase 6/7). Replaces the HTML5
 * `dataTransfer` payload entirely — WebKitGTK (Tauri on Linux) never fires
 * HTML5 dragstart, so tab drags run on pointer events (<-> #6695/#12052). */
export type DropTarget =
  | { kind: "tab"; tabId: string; paneId: string; edge: "left" | "right" }
  | { kind: "pane-body"; paneId: string }
  | { kind: "edge"; edge: EdgeZone; paneId: string };

export interface PointerDragState {
  tabId: string;
  sourcePaneId: string;
  cursor: { x: number; y: number } | null;
  hoverTarget: DropTarget | null;
}

// The drag payload is SHARED across every `useTabDnD()` instance. Drag starts
// in the source pane's TabsBar; the drop happens on a DIFFERENT pane's element
// tree (mid-drag we also query every leaf for hover targets). A per-instance
// ref would be empty on every pane but the drag source — the original design
// worked only because drops fell back to reading `dataTransfer`. Being
// module-global makes `isDraggingTab` and the payload identical everywhere.
export let draggedTab: DraggedTabState | null = null;
let dragSnapshot: PointerDragState | null = null;
const listeners = new Set<() => void>();

// Pointer-drag session state (Linux WebKitGTK has no HTML5 drag machinery).
export const DRAG_THRESHOLD_PX = 5;
interface PendingPointer {
  tabId: string;
  sourcePaneId: string;
  startX: number;
  startY: number;
}
export let pendingPointer: PendingPointer | null = null;
export let cursor: { x: number; y: number } | null = null;
export let hoverTarget: DropTarget | null = null;
export let sessionCleanup: (() => void) | null = null;

// ES module bindings are read-only for importers, so state writes go through
// these setters (reads use the live exported bindings above).
export function setPendingPointer(next: PendingPointer | null) {
  pendingPointer = next;
}

export function setCursor(next: { x: number; y: number } | null) {
  cursor = next;
}

export function setHoverTarget(next: DropTarget | null) {
  hoverTarget = next;
}

export function setSessionCleanup(next: (() => void) | null) {
  sessionCleanup = next;
}

function computeSnapshot() {
  dragSnapshot = draggedTab
    ? {
        tabId: draggedTab.tabId,
        sourcePaneId: draggedTab.sourcePaneId,
        cursor,
        hoverTarget,
      }
    : null;
}

export function notify() {
  computeSnapshot();
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): boolean {
  return draggedTab !== null;
}

export function getDragSnapshot(): PointerDragState | null {
  return dragSnapshot;
}

export function setDraggedTab(next: DraggedTabState | null) {
  draggedTab = next;
  notify();
}

/** Test hook: drop module-level drag state so cases don't leak into each other. */
export function resetTabDnDStateForTests() {
  sessionCleanup?.();
  sessionCleanup = null;
  pendingPointer = null;
  draggedTab = null;
  cursor = null;
  hoverTarget = null;
  notify();
}

export const swallowClickAfterDrag = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

// Read the shared drag state first, then fall back to dataTransfer. This is
// necessary because on macOS WebKit (Tauri), `dragend` can fire before `drop`,
// which would null the shared state before the drop handler runs.
export function readDraggedTab(event: DragEvent<Element>): DraggedTabState | null {
  if (draggedTab) return draggedTab;
  try {
    const raw = event.dataTransfer.getData("application/x-basalt-tab");
    if (raw) return JSON.parse(raw) as DraggedTabState;
  } catch {
    // ignore malformed data
  }
  return null;
}