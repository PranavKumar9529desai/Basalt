import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTabsStore } from "../store";
import { findLeaf } from "../lib/layoutTree";

interface DraggedTabState {
  tabId: string;
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
      draggedTabRef.current = { tabId };
      setIsDraggingTab(true);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(
        "application/x-basalt-tab",
        JSON.stringify({ tabId }),
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
      const leaf = findLeaf(state.root, state.activePaneId);
      if (!leaf) {
        clearDragState();
        return;
      }
      const tabIds = leaf.tabGroup.tabIds;
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
      handleTabDragEnd,
    }),
    [
      isDraggingTab,
      handleTabDragStart,
      handleTabDragOver,
      handleTabDropOnTab,
      handleTabDragEnd,
    ],
  );
}
