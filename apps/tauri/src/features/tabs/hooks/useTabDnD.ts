import {
  type DragEvent,
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

// The drag payload is SHARED across every `useTabDnD()` instance. Drag starts
// in the source pane's TabsBar; the drop happens on a DIFFERENT pane's element
// tree (mid-drag we also drop zones over every leaf). A per-instance ref would
// be empty on every pane but the drag source — the original design worked only
// because drops fell back to reading `dataTransfer`. Being module-global makes
// `isDraggingTab` and the payload identical everywhere.
let draggedTab: DraggedTabState | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return draggedTab !== null;
}

function setDraggedTab(next: DraggedTabState | null) {
  draggedTab = next;
  const frozen = listeners;
  for (const listener of frozen) listener();
}

/** Test hook: drop module-level drag state so cases don't leak into each other. */
export function resetTabDnDStateForTests() {
  draggedTab = null;
  for (const listener of listeners) listener();
}

// Read the shared drag state first, then fall back to dataTransfer. This is
// necessary because on macOS WebKit (Tauri), `dragend` can fire before `drop`,
// which would null the shared state before the drop handler runs.
function readDraggedTab(
  event: DragEvent<Element>,
): DraggedTabState | null {
  if (draggedTab) return draggedTab;
  try {
    const raw = event.dataTransfer.getData("application/x-basalt-tab");
    if (raw) return JSON.parse(raw) as DraggedTabState;
  } catch {
    // ignore malformed data
  }
  return null;
}

export function useTabDnD() {
  const isDraggingTab = useSyncExternalStore(subscribe, getSnapshot);

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
      if (!dragged || dragged.tabId === targetTabId) {
        clearDragState();
        return;
      }

      const state = useTabsStore.getState();
      const targetLeaf = findLeafByTab(state.root, targetTabId);
      if (!targetLeaf) {
        clearDragState();
        return;
      }

      // Cross-pane drop (ADR-032): the tab moves into the target pane at the
      // dropped edge's slot and focus follows it there.
      if (dragged.sourcePaneId !== targetLeaf.id) {
        const targetIndex =
          targetLeaf.tabGroup.tabIds.indexOf(targetTabId);
        state.moveTabToPane(
          dragged.tabId,
          targetLeaf.id,
          targetIndex + (edge === "right" ? 1 : 0),
        );
        clearDragState();
        return;
      }

      // Same-pane drop = reorder.
      const tabIds = targetLeaf.tabGroup.tabIds;
      const fromIndex = tabIds.indexOf(dragged.tabId);
      const toIndex = tabIds.indexOf(targetTabId);
      if (fromIndex === -1 || toIndex === -1) {
        clearDragState();
        return;
      }

      const insertionIndex = toIndex + (edge === "right" ? 1 : 0);
      const adjustedToIndex =
        fromIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
      if (fromIndex !== adjustedToIndex) {
        state.moveTabWithinPane(fromIndex, adjustedToIndex);
        state.activateTab(dragged.tabId);
      }

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
      if (!dragged) {
        clearDragState();
        return;
      }
      const state = useTabsStore.getState();
      const targetLeaf = findLeaf(state.root, paneId);
      if (targetLeaf && dragged.sourcePaneId !== targetLeaf.id) {
        state.moveTabToPane(dragged.tabId, paneId);
        state.activateTab(dragged.tabId);
      }
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
      if (!dragged) {
        clearDragState();
        return;
      }
      const state = useTabsStore.getState();
      const targetLeaf = findLeaf(state.root, paneId);
      if (targetLeaf) {
        const { orientation, placement } = edgeToSplit(edge);
        state.moveTabToNewPane(
          dragged.tabId,
          paneId,
          orientation,
          placement,
        );
      }
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
      handleTabDragStart,
      handleTabDragOver,
      handleTabDropOnTab,
      handlePaneBodyDrop,
      handleEdgeDrop,
      handleTabDragEnd,
    }),
    [
      isDraggingTab,
      handleTabDragStart,
      handleTabDragOver,
      handleTabDropOnTab,
      handlePaneBodyDrop,
      handleEdgeDrop,
      handleTabDragEnd,
    ],
  );
}