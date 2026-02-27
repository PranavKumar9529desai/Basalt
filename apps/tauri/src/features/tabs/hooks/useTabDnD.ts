import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
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
    // Fallback cleanup: browser DnD can occasionally miss React dragend handlers.
    const handleWindowDragEnd = () => clearDragState();
    const handleWindowDrop = () => clearDragState();
    window.addEventListener("dragend", handleWindowDragEnd);
    window.addEventListener("drop", handleWindowDrop);
    return () => {
      window.removeEventListener("dragend", handleWindowDragEnd);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [clearDragState]);

  const handleTabDragStart = useCallback(
    (groupId: TabGroupId, tabId: string, event: DragEvent<HTMLElement>) => {
      draggedTabRef.current = { tabId, fromGroupId: groupId };
      setIsDraggingTab(true);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", tabId);
    },
    [],
  );

  const handleTabDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleTabDropOnTab = useCallback(
    (groupId: TabGroupId, targetTabId: string, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const dragged = draggedTabRef.current;
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

  const handleTabDragEnd = useCallback((_: DragEvent<HTMLElement>) => {
    clearDragState();
  }, [clearDragState]);

  const handleSplitTargetDragEnter = useCallback(
    (groupId: TabGroupId, direction: SplitDirection, event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!draggedTabRef.current) return;
      setSplitTarget({ groupId, direction });
    },
    [],
  );

  const handleSplitTargetDragOver = useCallback(
    (groupId: TabGroupId, direction: SplitDirection, event: DragEvent<HTMLDivElement>) => {
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
        (groupId: TabGroupId, direction: SplitDirection, event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const dragged = draggedTabRef.current;
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

            const sourceIsSingleTab = sourceGroup.tabIds.length === 1;

            if (dragged.fromGroupId !== groupId) {
                state.moveTabBetweenGroups({
                    fromGroupId: dragged.fromGroupId,
                    toGroupId: groupId,
                    tabId: dragged.tabId,
                    toIndex: targetGroup.tabIds.length,
                });
            }

            if (dragged.fromGroupId === groupId || !sourceIsSingleTab) {
                const newGroupId = state.splitGroupWithTab(groupId, direction, dragged.tabId);
                state.setFocusedGroup(newGroupId);
                state.activateTab(newGroupId, dragged.tabId);
            } else {
                state.setFocusedGroup(groupId);
                state.activateTab(groupId, dragged.tabId);
            }

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
