import {
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useTabsStore } from "../store";
import { findLeafByTab } from "../lib/layoutTree";
import {
  DRAG_THRESHOLD_PX,
  type EdgeZone,
  draggedTab,
  getDragSnapshot,
  getSnapshot,
  notify,
  pendingPointer,
  readDraggedTab,
  sessionCleanup,
  setCursor,
  setDraggedTab,
  setHoverTarget,
  setPendingPointer,
  setSessionCleanup,
  subscribe,
  swallowClickAfterDrag,
} from "./lib/dragState";
import { cancelPointerSession, doTargetDrop } from "./lib/dropExec";
import { hitTestDropTarget } from "./lib/hitTest";

export type {
  EdgeZone,
  EdgeSplit,
  DropTarget,
  PointerDragState,
} from "./lib/dragState";
export { edgeToSplit, resetTabDnDStateForTests } from "./lib/dragState";

export function useTabDnD() {
  const isDraggingTab = useSyncExternalStore(subscribe, getSnapshot);
  const dragState = useSyncExternalStore(subscribe, getDragSnapshot);

  const clearDragState = useCallback(() => {
    setDraggedTab(null);
  }, []);

  useEffect(() => {
    const handleWindowDrop = () => clearDragState();
    const handleWindowDragEnd = () => clearDragState();
    window.addEventListener("drop", handleWindowDrop);
    window.addEventListener("dragend", handleWindowDragEnd);
    return () => {
      window.removeEventListener("drop", handleWindowDrop);
      window.removeEventListener("dragend", handleWindowDragEnd);
    };
  }, [clearDragState]);

  /** Arm a pointer-drag from a tab pill. A real drag starts only after the
   * pointer travels beyond DRAG_THRESHOLD_PX (plain clicks stay clicks). The
   * window-level move/up listeners outlive the pill, so the drag survives
   * leaving the tab bar and landing on any pane/zone anywhere. */
  const handleTabPointerDown = useCallback(
    (tabId: string, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      if (draggedTab || pendingPointer) return;
      if (sessionCleanup) {
        cancelPointerSession();
        return;
      }
      const sourcePaneId = findLeafByTab(
        useTabsStore.getState().root,
        tabId,
      )?.id;
      if (!sourcePaneId) return;

      setPendingPointer({
        tabId,
        sourcePaneId,
        startX: event.clientX,
        startY: event.clientY,
      });

      const onPointerMove = (e: globalThis.PointerEvent) => {
        if (!pendingPointer) return;
        if (!draggedTab) {
          const dx = e.clientX - pendingPointer.startX;
          const dy = e.clientY - pendingPointer.startY;
          if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
            return;
          }
          setDraggedTab({
            tabId: pendingPointer.tabId,
            sourcePaneId: pendingPointer.sourcePaneId,
          });
        }
        const nextCursor = { x: e.clientX, y: e.clientY };
        setCursor(nextCursor);
        setHoverTarget(hitTestDropTarget(nextCursor.x, nextCursor.y));
        notify();
      };

      const onPointerUp = (e: globalThis.PointerEvent) => {
        if (!pendingPointer) return;
        const wasDragging = draggedTab !== null;
        if (wasDragging) {
          const dragged = draggedTab!;
          const finalCursor = { x: e.clientX, y: e.clientY };
          setCursor(finalCursor);
          const finalTarget = hitTestDropTarget(finalCursor.x, finalCursor.y);
          setHoverTarget(finalTarget);
          notify();
          doTargetDrop(dragged, finalTarget);
          // A real drag ends in a pointerup, after which the browser fires a
          // `click` on whatever is under the cursor — swallow it so a drop
          // does not also select the target tab (or trigger other click work).
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
        if (draggedTab) e.preventDefault();
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

  const handleTabDragStart = useCallback(
    (tabId: string, event: DragEvent<HTMLElement>) => {
      const sourcePaneId = findLeafByTab(
        useTabsStore.getState().root,
        tabId,
      )?.id;
      if (!sourcePaneId) return;
      setDraggedTab({ tabId, sourcePaneId });
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(
        "application/x-basalt-tab",
        JSON.stringify({ tabId, sourcePaneId }),
      );
    },
    [],
  );

  const handleTabDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleTabDropOnTab = useCallback(
    (
      targetTabId: string,
      event: DragEvent<HTMLElement>,
      edge: "left" | "right" = "left",
    ) => {
      event.preventDefault();
      const dragged = readDraggedTab(event);
      if (!dragged) {
        clearDragState();
        return;
      }
      const targetLeaf = findLeafByTab(
        useTabsStore.getState().root,
        targetTabId,
      );
      if (!targetLeaf) {
        clearDragState();
        return;
      }
      doTargetDrop(dragged, {
        kind: "tab",
        tabId: targetTabId,
        paneId: targetLeaf.id,
        edge,
      });
      clearDragState();
    },
    [clearDragState],
  );

  /** Drop a tab on a pane's body (non-tab area, incl. empty panes): moves the
   * tab into that pane at the end. */
  const handlePaneBodyDrop = useCallback(
    (paneId: string, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const dragged = readDraggedTab(event);
      if (dragged) doTargetDrop(dragged, { kind: "pane-body", paneId });
      clearDragState();
    },
    [clearDragState],
  );

  /** Drop a tab on a pane's edge zone: split the pane and move the tab into
   * the fresh pane on that side (ADR-032 Phase 7 edge-drop zones). */
  const handleEdgeDrop = useCallback(
    (edge: EdgeZone, paneId: string, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const dragged = readDraggedTab(event);
      if (dragged) doTargetDrop(dragged, { kind: "edge", edge, paneId });
      clearDragState();
    },
    [clearDragState],
  );

  const handleTabDragEnd = useCallback(
    (_: DragEvent<HTMLElement>) => {
      clearDragState();
    },
    [clearDragState],
  );

  return useMemo(
    () => ({
      isDraggingTab,
      dragState,
      handleTabPointerDown,
      handleTabDragStart,
      handleTabDragOver,
      handleTabDropOnTab,
      handlePaneBodyDrop,
      handleEdgeDrop,
      handleTabDragEnd,
    }),
    [
      isDraggingTab,
      dragState,
      handleTabPointerDown,
      handleTabDragStart,
      handleTabDragOver,
      handleTabDropOnTab,
      handlePaneBodyDrop,
      handleEdgeDrop,
      handleTabDragEnd,
    ],
  );
}
