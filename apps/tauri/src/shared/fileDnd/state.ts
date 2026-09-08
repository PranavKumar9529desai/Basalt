/**
 * fileDnd/state — module-global drag state for file-tree drags.
 *
 * Mirrors `features/tabs/hooks/lib/dragState.ts`: the payload is SHARED across
 * every `useFileDrag()` instance. A drag starts in the file tree (vault) and
 * the drop lands on a DIFFERENT surface — an editor pane or the canvas — whose
 * component tree is unrelated to the source's. A per-instance ref would be
 * empty on every receiver, so the drag payload and cursor are module-global.
 *
 * WebKitGTK (Tauri on Linux) never fires HTML5 dragstart (#6695/#12052), so
 * file drags run on pointer events — the same reason tab drags do. The drag
 * source arms a pending pointer; only after it travels past DRAG_THRESHOLD_PX
 * does a real drag begin (plain clicks stay clicks).
 */
import type { DraggedFile } from "../../features/vault";

/** How far the pointer must travel before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 5;

interface PendingPointer {
  file: DraggedFile;
  startX: number;
  startY: number;
}

// ES module bindings are read-only for importers; writes go through setters.
export let draggedFile: DraggedFile | null = null;
export let pendingPointer: PendingPointer | null = null;
export let cursor: { x: number; y: number } | null = null;
export let sessionCleanup: (() => void) | null = null;

const listeners = new Set<() => void>();

export function setDraggedFile(next: DraggedFile | null) {
  draggedFile = next;
}

export function setPendingPointer(next: PendingPointer | null) {
  pendingPointer = next;
}

export function setCursor(next: { x: number; y: number } | null) {
  cursor = next;
}

export function setSessionCleanup(next: (() => void) | null) {
  sessionCleanup = next;
}

export function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while a file drag is in flight (drives the ghost + cursors). */
export function getSnapshot(): boolean {
  return draggedFile !== null;
}

export function getDragSnapshot(): DraggedFile | null {
  return draggedFile;
}

export function getCursorSnapshot(): { x: number; y: number } | null {
  return cursor;
}

/** End a pointer-drag session and clear every piece of drag state. */
export function cancelPointerSession(): void {
  if (sessionCleanup) {
    sessionCleanup();
    setSessionCleanup(null);
  }
  setPendingPointer(null);
  setCursor(null);
  setDraggedFile(null);
  notify();
}

/** After a real drag, the browser fires a `click` on the drop target —
 *  swallow it so a drop doesn't also open/select the thing under the cursor. */
export function swallowClickAfterDrag(e: MouseEvent): void {
  e.stopPropagation();
  e.preventDefault();
}

/** Test hook: drop module-level drag state so cases don't leak into each other. */
export function resetFileDnDStateForTests(): void {
  cancelPointerSession();
  listeners.clear();
}
