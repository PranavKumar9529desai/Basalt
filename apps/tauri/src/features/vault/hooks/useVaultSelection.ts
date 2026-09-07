import type { FileNode } from "@workspace/ui/components/file-tree";
import { useCallback, useState } from "react";
import type { FlatTreeNode } from "../types";

export interface VaultSelectionApi {
  selectedIds: Set<string>;
  anchorId: string | null;
  focusedId: string | null;
  handleSelect: (
    node: FileNode,
    modifiers: {
      metaKey?: boolean;
      ctrlKey?: boolean;
      shiftKey?: boolean;
    },
    visibleNodes: FlatTreeNode[],
  ) => void;
  setSelection: (ids: Set<string>) => void;
  clearSelection: () => void;
  setFocusedId: (id: string) => void;
}

export function useVaultSelectionState(): VaultSelectionApi {
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
      modifiers: {
        metaKey?: boolean;
        ctrlKey?: boolean;
        shiftKey?: boolean;
      },
      visibleNodes: FlatTreeNode[],
    ) => {
      const isMeta = Boolean(modifiers.metaKey || modifiers.ctrlKey);
      const isShift = Boolean(modifiers.shiftKey);
      const next = new Set(selectedIds);
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
        for (let i = lo; i <= hi; i++) next.add(visibleNodes[i].path);
      } else if (isMeta) {
        if (next.has(clickedId)) next.delete(clickedId);
        else next.add(clickedId);
      } else {
        next.clear();
        next.add(clickedId);
        setAnchorId(clickedId);
      }

      setFocusedId(clickedId);
      setSelectedIds(next);
      if (!isShift && !isMeta) setAnchorId(clickedId);
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
