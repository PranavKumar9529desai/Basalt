import type { Dispatch, DragEvent, RefObject, SetStateAction } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import type { CanvasXYNode } from "./mapper";

export interface NodeCreatorsDeps {
  reactFlowInstance: ReactFlowInstance;
  setNodes: Dispatch<SetStateAction<CanvasXYNode[]>>;
  nodesRef: RefObject<CanvasXYNode[]>;
  saveCanvasNow: () => void;
}

export interface NodeCreators {
  handleAddTextCard: (wx?: number, wy?: number) => void;
  handleAddGroup: () => void;
  handleAddLink: () => void;
  onDrop: (event: DragEvent) => void;
}

/** Screen-space center of the viewport, converted to flow coordinates — the
 * default position for nodes added without an explicit pointer position. */
function flowCenter(
  reactFlowInstance: ReactFlowInstance,
): { x: number; y: number } {
  return reactFlowInstance.screenToFlowPosition({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
}

function appendNode(
  setNodes: NodeCreatorsDeps["setNodes"],
  nodesRef: NodeCreatorsDeps["nodesRef"],
  saveCanvasNow: NodeCreatorsDeps["saveCanvasNow"],
  node: CanvasXYNode,
) {
  setNodes((nds) => {
    const next = [...nds, node];
    nodesRef.current = next;
    saveCanvasNow();
    return next;
  });
}

/**
 * Node-creation surface for the canvas: the toolbar adders (text card,
 * group, link) and native drop handling (URL → link card, path/text →
 * file card, OS file → file card). Factory over refs + setters so identity
 * is stable via the caller's useMemo.
 */
export function createNodeCreators(deps: NodeCreatorsDeps): NodeCreators {
  const { reactFlowInstance, setNodes, nodesRef, saveCanvasNow } = deps;

  const handleAddTextCard = (wx?: number, wy?: number) => {
    const center = flowCenter(reactFlowInstance);
    const newNode: CanvasXYNode = {
      id: `text-${Date.now()}`,
      type: "canvasText",
      position: { x: wx ?? center.x, y: wy ?? center.y },
      style: { width: 250, height: 140 },
      data: { text: "New Note" },
    };
    appendNode(setNodes, nodesRef, saveCanvasNow, newNode);
  };

  const handleAddGroup = () => {
    const center = flowCenter(reactFlowInstance);
    const newGroup: CanvasXYNode = {
      id: `group-${Date.now()}`,
      type: "canvasGroup",
      position: { x: center.x, y: center.y },
      style: { width: 400, height: 300, zIndex: -1 },
      data: { label: "Group" },
    };
    appendNode(setNodes, nodesRef, saveCanvasNow, newGroup);
  };

  const handleAddLink = () => {
    const center = flowCenter(reactFlowInstance);
    const newLink: CanvasXYNode = {
      id: `link-${Date.now()}`,
      type: "canvasLink",
      position: { x: center.x, y: center.y },
      style: { width: 260, height: 100 },
      data: { url: "https://" },
    };
    appendNode(setNodes, nodesRef, saveCanvasNow, newLink);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const pos = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const droppedText = event.dataTransfer.getData("text/plain");
    if (droppedText) {
      if (
        droppedText.startsWith("http://") ||
        droppedText.startsWith("https://")
      ) {
        const newLink: CanvasXYNode = {
          id: `link-${Date.now()}`,
          type: "canvasLink",
          position: { x: pos.x - 130, y: pos.y - 50 },
          style: { width: 260, height: 100 },
          data: { url: droppedText },
        };
        appendNode(setNodes, nodesRef, saveCanvasNow, newLink);
        return;
      } else if (droppedText.endsWith(".md") || droppedText.includes("/")) {
        const newFile: CanvasXYNode = {
          id: `file-${Date.now()}`,
          type: "canvasFile",
          position: { x: pos.x - 150, y: pos.y - 110 },
          style: { width: 300, height: 220 },
          data: { file: droppedText },
        };
        appendNode(setNodes, nodesRef, saveCanvasNow, newFile);
        return;
      }
    }

    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      const filePath = (file as any).path || file.name;
      const isMedia = !filePath.endsWith(".md");
      const newFile: CanvasXYNode = {
        id: `file-${Date.now()}`,
        type: "canvasFile",
        position: { x: pos.x - 150, y: pos.y - 110 },
        style: { width: isMedia ? 320 : 300, height: isMedia ? 240 : 220 },
        data: { file: filePath },
      };
      appendNode(setNodes, nodesRef, saveCanvasNow, newFile);
    }
  };

  return { handleAddTextCard, handleAddGroup, handleAddLink, onDrop };
}