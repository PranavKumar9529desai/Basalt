import { useTabsStore } from "../../store";
import { findLeaf } from "../../lib/layoutTree";
import type { DraggedTabState, DropTarget } from "./dragState";
import {
  edgeToSplit,
  notify,
  sessionCleanup,
  setCursor,
  setDraggedTab,
  setHoverTarget,
  setPendingPointer,
  setSessionCleanup,
} from "./dragState";

/** End a pointer session: remove window listeners and clear all drag state. */
export function cancelPointerSession() {
  sessionCleanup?.();
  setSessionCleanup(null);
  setPendingPointer(null);
  setDraggedTab(null);
  setCursor(null);
  setHoverTarget(null);
  notify();
}

/** Execute a drop against the store. Used by BOTH the HTML5 handlers and the
 * pointer-drag path so the two never drift apart. */
export function doTargetDrop(
  dragged: DraggedTabState,
  target: DropTarget | null,
) {
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
