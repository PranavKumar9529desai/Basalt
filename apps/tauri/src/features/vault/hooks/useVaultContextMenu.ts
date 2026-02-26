import type { MouseEvent } from "react";
import { useCallback, useState } from "react";
import type { FlatTreeNode } from "../types";

export type VaultContextTargetKind = "file" | "folder" | "root";

export interface VaultContextTarget {
  kind: VaultContextTargetKind;
  node: FlatTreeNode | null;
}

export interface VaultContextMenuState {
  anchor: { x: number; y: number } | null;
  target: VaultContextTarget | null;
  isMultiSelect: boolean;
}

export interface UseVaultContextMenuReturn {
  menuState: VaultContextMenuState;
  isOpen: boolean;
  openForNode: (
    node: FlatTreeNode,
    e: MouseEvent,
    isMultiSelect: boolean,
  ) => void;
  openForRoot: (e: MouseEvent) => void;
  closeMenu: () => void;
}

export function useVaultContextMenu(): UseVaultContextMenuReturn {
  const [menuState, setMenuState] = useState<VaultContextMenuState>({
    anchor: null,
    target: null,
    isMultiSelect: false,
  });

  const openForNode = useCallback(
    (node: FlatTreeNode, e: MouseEvent, isMultiSelect: boolean) => {
      setMenuState({
        anchor: { x: e.clientX, y: e.clientY },
        target: {
          kind: node.kind,
          node,
        },
        isMultiSelect,
      });
    },
    [],
  );

  const openForRoot = useCallback((e: MouseEvent) => {
    setMenuState({
      anchor: { x: e.clientX, y: e.clientY },
      target: {
        kind: "root",
        node: null,
      },
      isMultiSelect: false,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState({
      anchor: null,
      target: null,
      isMultiSelect: false,
    });
  }, []);

  return {
    menuState,
    isOpen: menuState.target !== null,
    openForNode,
    openForRoot,
    closeMenu,
  };
}
