import {
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useTabsStore } from "../store";
import { findLeaf, findLeafByTab } from "../lib/layoutTree";

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

interface DraggedTabState {
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
let draggedTab: DraggedTabState | null = null;
let dragSnapshot: PointerDragState | null = null;
const listeners = new Set<() => void>();

// Pointer-drag session state (Linux WebKitGTK has no HTML5 drag machinery).
const DRAG_THRESHOLD_PX = 5;
interface PendingPointer {
  tabId: string;
  sourcePaneId: string;
  startX: number;
  startY: number;
}
let pendingPointer: PendingPointer | null = null;
let cursor: { x: number; y: number } | null = null;
let hoverTarget: DropTarget | null = null;
let sessionCleanup: (() => void) | null = null;

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

function notify() {
  computeSnapshot();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return draggedTab !== null;
}

function getDragSnapshot(): PointerDragState | null {
  return dragSnapshot;
}

function setDraggedTab(next: DraggedTabState | null) {
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

const swallowClickAfterDrag = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

// Read the shared drag state first, then fall back to dataTransfer. This is
// necessary because on macOS WebKit (Tauri), `dragend` can fire before `drop`,
// which would null the shared state before the drop handler runs.
function readDraggedTab(event: DragEvent<Element>): DraggedTabState | null {
  if (draggedTab) return draggedTab;
  try {
    const raw = event.dataTransfer.getData("application/x-basalt-tab");
    if (raw) return JSON.parse(raw) as DraggedTabState;
  } catch {
    // ignore malformed data
  }
  return null;
}

/** Resolve the drop target under a cursor position via real DOM hit-testing
 * (elementFromPoint was chosen over geometric store math because the DOM is
 * the single source of truth for where pills/panes actually are). */
function hitTestDropTarget(x: number, y: number): DropTarget | null {
  const el = document.elementFromPoint(x, y);
  if (!el || !(el instanceof Element)) return null;

  // A tab pill: the slot is the half of the pill under the cursor.
  const pill = el.closest<HTMLElement>("[data-tab-id]");
  if (pill) {
    const tabId = pill.dataset.tabId;
    const paneId = pill.dataset.tabPaneId;
    if (tabId && paneId && draggedTab && tabId !== draggedTab.tabId) {
      const rect = pill.getBoundingClientRect();
      const edge: "left" | "right" =
        x < rect.left + rect.width / 2 ? "left" : "right";
      return { kind: "tab", tabId, edge, paneId };
    }
    return null;
  }

  // The tab strip gutter (between pills / past the last pill): snap to the
  // nearest pill's edge so reorder targets are reachable without pixel-perfect
  // aim on the pills themselves.
  const tablist = el.closest<HTMLElement>("[role=tablist]");
  if (tablist) {
    let best: { pill: HTMLElement; center: number } | null = null;
    for (const pillEl of tablist.querySelectorAll<HTMLElement>(
      "[data-tab-id]",
    )) {
      const rect = pillEl.getBoundingClientRect();
      if (rect.width <= 0) continue;
      const center = rect.left + rect.width / 2;
      if (!best || Math.abs(x - center) < Math.abs(x - best.center)) {
        best = { pill: pillEl, center };
      }
    }
    if (best) {
      const tabId = best.pill.dataset.tabId;
      const paneId = best.pill.dataset.tabPaneId;
      if (tabId && paneId && draggedTab && tabId !== draggedTab.tabId) {
        const rect = best.pill.getBoundingClientRect();
        const edge: "left" | "right" =
          x < rect.left + rect.width / 2 ? "left" : "right";
        return { kind: "tab", tabId, edge, paneId };
      }
    }
    return null;
  }

  // A pane body (or an empty leaf's whole area): edges split, center moves.
  const body = el.closest<HTMLElement>("[data-basalt-pane-body]");
  if (body) {
    const paneId = body.dataset.paneId;
    if (!paneId) return null;
    const rect = body.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const midLeft = rect.left + rect.width * 0.25;
    const midRight = rect.left + rect.width * 0.75;
    const topBand = rect.top + rect.height * 0.33;
    const bottomBand = rect.top + rect.height * 0.66;
    if (x < midLeft) return { kind: "edge", edge: "left", paneId };
    if (x > midRight) return { kind: "edge", edge: "right", paneId };
    if (y < topBand) return { kind: "edge", edge: "top", paneId };
    if (y > bottomBand) return { kind: "edge", edge: "bottom", paneId };
    return { kind: "pane-body", paneId };
  }

  return null;
}

/** Execute a drop against the store. Used by BOTH the HTML5 handlers and the
 * pointer-drag path so the two never drift apart. */
function doTargetDrop(dragged: DraggedTabState, target: DropTarget | null) {
  const state = useTabsStore.getState();
  switch (target?.kind) {
    case "edge": {
      const leaf = findLeaf(state.root, target.paneId);
      if (leaf) {
        const { orientation, placement } = edgeToSplit(target.edge);
        state.moveTabToNewPane(
          dragged.tabId,
          target.paneId,
          orientation,
          placement,
        );
      }
      break;
    }
    case "pane-body": {
      const leaf = findLeaf(state.root, target.paneId);
      if (leaf && dragged.sourcePaneId !== target.paneId) {
        state.moveTabToPane(dragged.tabId, target.paneId);
        state.activateTab(dragged.tabId);
      }
      break;
    }
    case "tab": {
      const targetLeaf = findLeaf(state.root, target.paneId);
      if (!targetLeaf || dragged.tabId === target.tabId) break;

      // Cross-pane drop (ADR-032): the tab moves into the target pane at the
      // dropped edge's slot and focus follows it there.
      if (dragged.sourcePaneId !== target.paneId) {
        const targetIndex = targetLeaf.tabGroup.tabIds.indexOf(target.tabId);
        if (targetIndex === -1) break;
        state.moveTabToPane(
          dragged.tabId,
          target.paneId,
          targetIndex + (target.edge === "right" ? 1 : 0),
        );
        break;
      }

      // Same-pane drop = reorder.
      const tabIds = targetLeaf.tabGroup.tabIds;
      const fromIndex = tabIds.indexOf(dragged.tabId);
      const toIndex = tabIds.indexOf(target.tabId);
      if (fromIndex === -1 || toIndex === -1) break;
      const insertionIndex = toIndex + (target.edge === "right" ? 1 : 0);
      const adjustedToIndex =
        fromIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
      if (fromIndex !== adjustedToIndex) {
        state.moveTabWithinPane(fromIndex, adjustedToIndex);
        state.activateTab(dragged.tabId);
      }
      break;
    }
  }
}

/** End a pointer session: remove window listeners and clear all drag state. */
function cancelPointerSession() {
  sessionCleanup?.();
  sessionCleanup = null;
  pendingPointer = null;
  draggedTab = null;
  cursor = null;
  hoverTarget = null;
  notify();
}

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

      pendingPointer = {
        tabId,
        sourcePaneId,
        startX: event.clientX,
        startY: event.clientY,
      };

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
        cursor = { x: e.clientX, y: e.clientY };
        hoverTarget = hitTestDropTarget(cursor.x, cursor.y);
        notify();
      };

      const onPointerUp = (e: globalThis.PointerEvent) => {
        if (!pendingPointer) return;
        const wasDragging = draggedTab !== null;
        if (wasDragging) {
          const dragged = draggedTab!;
          cursor = { x: e.clientX, y: e.clientY };
          hoverTarget = hitTestDropTarget(cursor.x, cursor.y);
          notify();
          doTargetDrop(dragged, hoverTarget);
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
      sessionCleanup = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
        window.removeEventListener("blur", onWindowBlur);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("selectstart", onSelectStart);
      };
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
