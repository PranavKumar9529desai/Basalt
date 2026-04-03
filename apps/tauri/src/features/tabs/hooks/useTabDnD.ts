import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { useTabsStore } from "../store";
import type { SplitDirection, TabGroupId } from "../types";

interface DraggedTabState {
  tabId: string;
  fromGroupId: TabGroupId;
}

interface SplitTargetState {
  groupId: TabGroupId;
  direction: SplitDirection;
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
    // Fallback cleanup for drops that land outside any valid drop target.
    // We deliberately do NOT listen to "dragend" here because on macOS WebKit,
    // dragend fires before drop, which would clear the ref before the drop handler runs.
    const handleWindowDrop = () => clearDragState();
    window.addEventListener("drop", handleWindowDrop);
    return () => {
      window.removeEventListener("drop", handleWindowDrop);
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
        const toIndex = targetGroup.tabIds.indexOf(targetTabId);
        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
          state.moveTabWithinGroup(groupId, fromIndex, toIndex);
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
      direction: SplitDirection,
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
      direction: SplitDirection,
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
    (groupId: TabGroupId, direction: SplitDirection) => {
      setSplitTarget((prev) => {
        if (!prev) return prev;
        if (prev.groupId === groupId && prev.direction === direction) {
          return null;
        }
        return prev;
      });
    },
    [],
  );

  const handleSplitTargetDrop = useCallback(
    (
      groupId: TabGroupId,
      direction: SplitDirection,
      event: DragEvent<HTMLDivElement>,
    ) => {
      console.log("[DROP DEBUG]", {
        groupId,
        direction,
        hasDataTransfer: !!event.dataTransfer.types.length,
      });
      event.preventDefault();
      const dragged = readDraggedTab(draggedTabRef, event);
      console.log("[DROP DEBUG] dragged state:", dragged);
      if (!dragged) {
        clearDragState();
        return;
      }

      const state = useTabsStore.getState();
      const sourceGroup = state.groups[dragged.fromGroupId];
      const targetGroup = state.groups[groupId];
      if (!sourceGroup || !targetGroup) {
        console.log("[DROP DEBUG] groups missing", {
          sourceGroup: !!sourceGroup,
          targetGroup: !!targetGroup,
        });
        clearDragState();
        return;
      }

      console.log("[DROP DEBUG] executing split", {
        fromGroupId: dragged.fromGroupId,
        toGroupId: groupId,
      });
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
      console.log("[DROP DEBUG] split complete", { newGroupId });
      state.setFocusedGroup(newGroupId);
      state.activateTab(newGroupId, dragged.tabId);

      clearDragState();
    },
    [clearDragState],
  );

  const getSplitTargetDirection = useCallback(
    (groupId: TabGroupId): SplitDirection | null =>
      splitTarget?.groupId === groupId ? splitTarget.direction : null,
    [splitTarget],
  );

  return {
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
  };
}
