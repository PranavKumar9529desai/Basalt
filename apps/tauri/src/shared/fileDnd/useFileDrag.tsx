/**
 * fileDnd/useFileDrag — pointer-drag source for file-tree rows.
 *
 * Mirrors the tab-DnD hook (features/tabs/hooks/useTabDnD.ts): a real drag
 * starts only after the pointer travels past DRAG_THRESHOLD_PX (plain clicks
 * stay clicks and open the note as usual). Window-level move/up listeners
 * outlive the tree row, so the drag survives leaving the tree and landing on
 * any pane — the drop is resolved by `dispatchFileDrop` at pointerup.
 */
import { useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { DraggedFile, FlatTreeNode } from "../../features/vault";
import { dispatchFileDrop } from "./drop";
import {
  DRAG_THRESHOLD_PX,
  cancelPointerSession,
  draggedFile,
  getCursorSnapshot,
  getDragSnapshot,
  getSnapshot,
  notify,
  pendingPointer,
  sessionCleanup,
  setCursor,
  setDraggedFile,
  setPendingPointer,
  setSessionCleanup,
  subscribe,
  swallowClickAfterDrag,
} from "./state";

export function useFileDrag() {
  const isDraggingFile = useSyncExternalStore(subscribe, getSnapshot);

  const handleFilePointerDown = useCallback(
    (node: FlatTreeNode, event: React.PointerEvent) => {
      if (event.button !== 0) return;
      if (draggedFile || pendingPointer) return;
      if (sessionCleanup) {
        cancelPointerSession();
        return;
      }
      const file: DraggedFile = {
        path: node.path,
        relPath: node.relPath,
        name: node.name,
      };
      setPendingPointer({
        file,
        startX: event.clientX,
        startY: event.clientY,
      });

      const onPointerMove = (e: globalThis.PointerEvent) => {
        if (!pendingPointer) return;
        if (!draggedFile) {
          const dx = e.clientX - pendingPointer.startX;
          const dy = e.clientY - pendingPointer.startY;
          if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
            return;
          }
          setDraggedFile(pendingPointer.file);
        }
        setCursor({ x: e.clientX, y: e.clientY });
        notify();
      };

      const onPointerUp = (e: globalThis.PointerEvent) => {
        if (!pendingPointer) return;
        const wasDragging = draggedFile !== null;
        if (wasDragging) {
          const file = draggedFile!;
          setCursor({ x: e.clientX, y: e.clientY });
          notify();
          dispatchFileDrop(file, e.clientX, e.clientY);
          // A real drag ends in pointerup, after which the browser fires a
          // `click` on whatever is under the cursor — swallow it so a drop
          // does not also open/select the target (or the tree row).
          window.addEventListener("click", swallowClickAfterDrag, {
            capture: true,
            once: true,
          });
        }
        cancelPointerSession();
      };

      const onPointerCancel = () => {
        if (pendingPointer) cancelPointerSession();
      };

      const onWindowBlur = () => {
        if (pendingPointer) cancelPointerSession();
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && pendingPointer) cancelPointerSession();
      };

      // Prevent text selection while a drag is in flight (WebKit selects on
      // move otherwise).
      const onSelectStart = (e: Event) => {
        if (draggedFile) e.preventDefault();
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      window.addEventListener("blur", onWindowBlur);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("selectstart", onSelectStart);
      setSessionCleanup(() => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
        window.removeEventListener("blur", onWindowBlur);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("selectstart", onSelectStart);
      });
    },
    [],
  );

  return { isDraggingFile, handleFilePointerDown };
}

function ghostLabel(file: DraggedFile): string {
  return file.name.replace(/\.(md|canvas)$/i, "") || file.name;
}

/** Floating note pill that follows the cursor while a file drag is in flight.
 *  Rendered through a portal so it floats above every pane and dock. */
export function FileDragGhost() {
  const file = useSyncExternalStore(subscribe, getDragSnapshot);
  const pos = useSyncExternalStore(subscribe, getCursorSnapshot);
  if (!file || !pos) return null;
  return createPortal(
    <div
      className="pointer-events-none fixed z-[100] flex items-center gap-2 rounded-md bg-[var(--sat-surface-2)] px-2.5 py-1.5 text-[13px] text-[var(--sat-text-primary)] shadow-lg ring-1 ring-[var(--sat-layout-border)]"
      style={{ left: pos.x + 12, top: pos.y + 10 }}
    >
      <svg
        className="h-3.5 w-3.5 shrink-0 text-[var(--sat-accent-primary)]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span className="max-w-[200px] truncate">{ghostLabel(file)}</span>
    </div>,
    document.body,
  );
}
