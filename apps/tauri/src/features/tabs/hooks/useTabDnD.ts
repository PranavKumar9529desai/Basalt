import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTabsStore } from "../store";
import type { SplitDirection, TabGroupId } from "../types";

// "center" means merge tab into the target group without splitting.
type DropDirection = SplitDirection | "center";

interface DraggedTabState {
  tabId: string;
  fromGroupId: TabGroupId;
}

interface SplitTargetState {
  groupId: TabGroupId;
  direction: DropDirection;
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
  const [splitTarget, setSplitTarget] = useState<SplitTargetState | null>(null);

  const clearDragState = useCallback(() => {
    draggedTabRef.current = null;
    setSplitTarget(null);
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
    (groupId: TabGroupId, tabId: string, event: DragEvent<HTMLElement>) => {

      const dragData: DraggedTabState = { tabId, fromGroupId: groupId };
      draggedTabRef.current = dragData;
      setIsDraggingTab(true);
      event.dataTransfer.effectAllowed = "move";
      // Store full drag state in dataTransfer so drop handlers can recover it even if
      // dragend fires before drop (a known macOS WebKit / Tauri bug).
      event.dataTransfer.setData(
        "application/x-basalt-tab",
        JSON.stringify(dragData),
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
      groupId: TabGroupId,
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
      const sourceGroup = state.groups[dragged.fromGroupId];
      const targetGroup = state.groups[groupId];
      if (!sourceGroup || !targetGroup) {
        clearDragState();
        return;
      }

      if (dragged.fromGroupId === groupId) {
        const fromIndex = sourceGroup.tabIds.indexOf(dragged.tabId);
        const targetIndex = targetGroup.tabIds.indexOf(targetTabId);
        if (fromIndex === -1 || targetIndex === -1) {
          clearDragState();
          return;
        }
        // Convert edge + targetIndex into a raw insertion position in the
        // original array, then adjust for the splice-removal offset.
        const insertionIndex = targetIndex + (edge === "right" ? 1 : 0);
        const adjustedToIndex =
          fromIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
        if (fromIndex !== adjustedToIndex) {
          state.moveTabWithinGroup(groupId, fromIndex, adjustedToIndex);
          state.activateTab(groupId, dragged.tabId);
        }
      } else {
        const toIndex = targetGroup.tabIds.indexOf(targetTabId);
        state.moveTabBetweenGroups({
          fromGroupId: dragged.fromGroupId,
          toGroupId: groupId,
          tabId: dragged.tabId,
          toIndex: toIndex === -1 ? undefined : toIndex,
        });
        state.setFocusedGroup(groupId);
        state.activateTab(groupId, dragged.tabId);
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

  const handleSplitTargetDragEnter = useCallback(
    (
      groupId: TabGroupId,
      direction: DropDirection,
      event: DragEvent<HTMLDivElement>,
    ) => {
      event.preventDefault();
      if (!draggedTabRef.current) return;
      setSplitTarget({ groupId, direction });
    },
    [],
  );

  const handleSplitTargetDragOver = useCallback(
    (
      groupId: TabGroupId,
      direction: DropDirection,
      event: DragEvent<HTMLDivElement>,
    ) => {
      event.preventDefault();
      if (!draggedTabRef.current) return;
      setSplitTarget((prev) => {
        if (prev?.groupId === groupId && prev.direction === direction) {
          return prev;
        }
        return { groupId, direction };
      });
      event.dataTransfer.dropEffect = "move";
    },
    [],
  );

  const handleSplitTargetDragLeave = useCallback(
    (groupId: TabGroupId, _direction: DropDirection) => {
      setSplitTarget((prev) => {
        if (!prev || prev.groupId !== groupId) return prev;
        return null;
      });
    },
    [],
  );

  const handleSplitTargetDrop = useCallback(
    (
      groupId: TabGroupId,
      direction: DropDirection,
      event: DragEvent<HTMLDivElement>,
    ) => {
      event.preventDefault();
      const dragged = readDraggedTab(draggedTabRef, event);
      if (!dragged) {
        clearDragState();
        return;
      }

      const state = useTabsStore.getState();
      const sourceGroup = state.groups[dragged.fromGroupId];
      const targetGroup = state.groups[groupId];
      if (!sourceGroup || !targetGroup) {

        clearDragState();
        return;
      }

      if (direction === "center") {
        // Merge tab into the target group without creating a new split.
        if (dragged.fromGroupId !== groupId) {
          state.moveTabBetweenGroups({
            fromGroupId: dragged.fromGroupId,
            toGroupId: groupId,
            tabId: dragged.tabId,
          });
        }
        state.setFocusedGroup(groupId);
        state.activateTab(groupId, dragged.tabId);
        clearDragState();
        return;
      }

      // For directional splits: ensure the tab is in the target group first,
      // then split it out into a new pane.
      if (dragged.fromGroupId !== groupId) {
        state.moveTabBetweenGroups({
          fromGroupId: dragged.fromGroupId,
          toGroupId: groupId,
          tabId: dragged.tabId,
          toIndex: targetGroup.tabIds.length,
        });
      }

      const newGroupId = state.splitGroupWithTab(
        groupId,
        direction,
        dragged.tabId,
      );
      state.setFocusedGroup(newGroupId);
      state.activateTab(newGroupId, dragged.tabId);

      clearDragState();
    },
    [clearDragState],
  );

  const getSplitTargetDirection = useCallback(
    (groupId: TabGroupId): DropDirection | null =>
      splitTarget?.groupId === groupId ? splitTarget.direction : null,
    [splitTarget],
  );

  return useMemo(
    () => ({
      isDraggingTab,
      getSplitTargetDirection,
      handleTabDragStart,
      handleTabDragOver,
      handleTabDropOnTab,
      handleTabDragEnd,
      handleSplitTargetDragEnter,
      handleSplitTargetDragOver,
      handleSplitTargetDragLeave,
      handleSplitTargetDrop,
    }),
    [
      isDraggingTab,
      getSplitTargetDirection,
      handleTabDragStart,
      handleTabDragOver,
      handleTabDropOnTab,
      handleTabDragEnd,
      handleSplitTargetDragEnter,
      handleSplitTargetDragOver,
      handleSplitTargetDragLeave,
      handleSplitTargetDrop,
    ],
  );
}
