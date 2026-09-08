import { useCallback, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import type { CanvasXYNode } from "../lib/mapper";

export interface UseCanvasModalsOptions {
  reactFlowInstance: ReactFlowInstance;
  setNodes: Dispatch<SetStateAction<CanvasXYNode[]>>;
  nodesRef: RefObject<CanvasXYNode[]>;
  saveCanvasNow: () => void;
}

export function useCanvasModals({
  reactFlowInstance,
  setNodes,
  nodesRef,
  saveCanvasNow,
}: UseCanvasModalsOptions) {
  const [isNotePickerOpen, setIsNotePickerOpen] = useState(false);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);

  const handleSelectNote = useCallback(
    (note: { name: string; path: string }) => {
      const center = reactFlowInstance.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const newNode: CanvasXYNode = {
        id: `file-${Date.now()}`,
        type: "canvasFile",
        position: { x: center.x - 150, y: center.y - 110 },
        style: { width: 300, height: 220 },
        data: { file: note.path },
      };
      setNodes((nds) => {
        const next = [...nds, newNode];
        nodesRef.current = next;
        saveCanvasNow();
        return next;
      });
    },
    [reactFlowInstance, saveCanvasNow, setNodes, nodesRef],
  );

  const handleSelectAsset = useCallback(
    (asset: { rel_path: string; abs_path: string; file_type: string }) => {
      const center = reactFlowInstance.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const isAudio = asset.file_type === "audio";
      const isImage = asset.file_type === "image";
      const width = isImage ? 360 : isAudio ? 320 : 380;
      const height = isImage ? 280 : isAudio ? 120 : 260;
      const newNode: CanvasXYNode = {
        id: `file-${Date.now()}`,
        type: "canvasFile",
        position: { x: center.x - width / 2, y: center.y - height / 2 },
        style: { width, height },
        data: { file: asset.rel_path || asset.abs_path },
      };
      setNodes((nds) => {
        const next = [...nds, newNode];
        nodesRef.current = next;
        saveCanvasNow();
        return next;
      });
    },
    [reactFlowInstance, saveCanvasNow, setNodes, nodesRef],
  );

  return {
    isNotePickerOpen,
    setIsNotePickerOpen,
    isAssetPickerOpen,
    setIsAssetPickerOpen,
    handleSelectNote,
    handleSelectAsset,
  };
}