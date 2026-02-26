import { useCallback, useState } from "react";
import type { FlatTreeNode } from "../types";
import type { FileNode } from "@workspace/ui/components/file-tree";

export interface UseVaultSelectionReturn {
  selectedIds: Set<string>;
  anchorId: string | null;
  focusedId: string | null;
  handleSelect: (
    node: FileNode,
    modifiers: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean },
    visibleNodes: FlatTreeNode[],
  ) => void;
  setSelection: (ids: Set<string>) => void;
  clearSelection: () => void;
  setFocusedId: (id: string | null) => void;
}

/**
 * Centralized multi-selection logic (Ctrl/Cmd toggle, Shift range).
 * Keeps UI dumb and ready for future context menus.
 */
export function useVaultSelection(): UseVaultSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  const setSelection = useCallback((ids: Set<string>) => {
    setSelectedIds(new Set(ids));
  }, []);

  const handleSelect = useCallback(
    (
      node: FileNode,
      modifiers: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean },
      visibleNodes: FlatTreeNode[],
    ) => {
      const isMeta = Boolean(modifiers.metaKey || modifiers.ctrlKey);
      const isShift = Boolean(modifiers.shiftKey);

      const next = new Set(selectedIds);

      // Build index map for range selection
      const indexById = new Map<string, number>();
      visibleNodes.forEach((n, idx) => {
        indexById.set(n.path, idx);
      });

      const clickedId = node.id;

      if (isShift && anchorId && indexById.has(anchorId)) {
        const start = indexById.get(anchorId) ?? 0;
        const end = indexById.get(clickedId) ?? start;
        const [lo, hi] = start < end ? [start, end] : [end, start];
        next.clear();
        for (let i = lo; i <= hi; i++) {
          next.add(visibleNodes[i].path);
        }
        // Anchor stays as-is
      } else if (isMeta) {
        // Toggle selection
        if (next.has(clickedId)) {
          next.delete(clickedId);
        } else {
          next.add(clickedId);
        }
        // Anchor unchanged (VS Code behavior)
      } else {
        // Plain click: single selection
        next.clear();
        next.add(clickedId);
        setAnchorId(clickedId);
      }

      setFocusedId(clickedId);
      setSelectedIds(next);
      if (!isShift && !isMeta) {
        setAnchorId(clickedId);
      }
    },
    [anchorId, selectedIds],
  );

  return {
    selectedIds,
    anchorId,
    focusedId,
    handleSelect,
    setSelection,
    clearSelection,
    setFocusedId,
  };
}
