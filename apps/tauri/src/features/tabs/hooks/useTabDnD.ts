import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTabsStore } from "../store";
import { findLeaf, findLeafByTab } from "../lib/layoutTree";

interface DraggedTabState {
  tabId: string;
  sourcePaneId: string;
}

// Read drag state from the ref first, then fall back to dataTransfer.
// This is necessary because on macOS WebKit (Tauri), `dragend` can fire before `drop`,
// which would null out the ref before the drop handler runs.
function readDraggedTab(
  ref: { current: DraggedTabState | null },
  event: DragEvent<Element>,
): DraggedTabState | null {
  if (ref.current) return ref.current;
  try {
    const raw = event.dataTransfer.getData("application/x-basalt-tab");
    if (raw) return JSON.parse(raw) as DraggedTabState;
  } catch {
    // ignore malformed data
  }
  return null;
}

export function useTabDnD() {
  const draggedTabRef = useRef<DraggedTabState | null>(null);
  const [isDraggingTab, setIsDraggingTab] = useState(false);

  const clearDragState = useCallback(() => {
    draggedTabRef.current = null;
    setIsDraggingTab(false);
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
      draggedTabRef.current = { tabId, sourcePaneId };
      setIsDraggingTab(true);
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
      const dragged = readDraggedTab(draggedTabRef, event);
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
      const dragged = readDraggedTab(draggedTabRef, event);
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
      handleTabDragEnd,
    }),
    [
      isDraggingTab,
      handleTabDragStart,
      handleTabDragOver,
      handleTabDropOnTab,
      handlePaneBodyDrop,
      handleTabDragEnd,
    ],
  );
}
