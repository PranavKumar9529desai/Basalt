import { useCallback } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Edge } from "@xyflow/react";
import type { CanvasXYNode } from "../lib/mapper";

export interface UseCanvasSelectionOptions {
  setNodes: Dispatch<SetStateAction<CanvasXYNode[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  nodesRef: RefObject<CanvasXYNode[]>;
  edgesRef: RefObject<Edge[]>;
  saveCanvasNow: () => void;
}

export function useCanvasSelection({
  setNodes,
  setEdges,
  nodesRef,
  edgesRef,
  saveCanvasNow,
}: UseCanvasSelectionOptions) {
  const handleDeleteSelection = useCallback(() => {
    setNodes((nds) => {
      const nextNds = nds.filter((n) => !n.selected);
      nodesRef.current = nextNds;
      setEdges((eds) => {
        const nextEds = eds.filter(
          (e) =>
            !e.selected &&
            nextNds.some((n) => n.id === e.source) &&
            nextNds.some((n) => n.id === e.target),
        );
        edgesRef.current = nextEds;
        saveCanvasNow();
        return nextEds;
      });
      return nextNds;
    });
  }, [saveCanvasNow, setNodes, setEdges, nodesRef, edgesRef]);

  const handleGroupSelection = useCallback(() => {
    console.log("Group selection not fully implemented");
  }, []);

  return { handleDeleteSelection, handleGroupSelection };
}
