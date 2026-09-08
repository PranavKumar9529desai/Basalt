import { useCallback, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnEdgesChange,
  type OnNodesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import { createGhostHandlers } from "./connections";
import { createNodeCreators } from "./createNodes";
import type { CanvasXYNode } from "./mapper";
import {
  applySnapChanges,
  shouldTriggerSave,
  syncDimensions,
} from "./nodeChanges";
import type { GuidelinesState } from "./useCanvasGuidelines";

export interface UseCanvasStateOptions {
  reactFlowInstance: ReactFlowInstance;
  nodesRef: RefObject<CanvasXYNode[]>;
  edgesRef: RefObject<Edge[]>;
  saveCanvasNow: () => void;
  triggerSave: () => void;
  setGuidelines: Dispatch<SetStateAction<GuidelinesState>>;
  clearGuidelines: () => void;
}

/**
 * Canvas node/edge state + the React Flow change handlers that mutate it.
 * Composes focused factories from `lib/`: node-change semantics
 * (nodeChanges), the connect/ghost gesture (connections), and node creation
 * (createNodes) — this hook owns the state + refs and the remaining small
 * handlers (drag duplication, drop affordance, double-click adder).
 */
export function useCanvasState({
  reactFlowInstance,
  nodesRef,
  edgesRef,
  saveCanvasNow,
  triggerSave,
  setGuidelines,
  clearGuidelines,
}: UseCanvasStateOptions) {
  const [nodes, setNodes] = useState<CanvasXYNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const connectingNodeRef = useRef<{
    nodeId: string;
    handleId: string | null;
  } | null>(null);

  nodesRef.current = nodes;
  edgesRef.current = edges;

  const updateText = useCallback(
    (id: string, text: string) => {
      setNodes((nds) => {
        const next = nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, text } } : n,
        );
        nodesRef.current = next;
        triggerSave();
        return next;
      });
    },
    [triggerSave, nodesRef],
  );

  const updateUrl = useCallback(
    (id: string, url: string) => {
      setNodes((nds) => {
        const next = nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, url } } : n,
        );
        nodesRef.current = next;
        triggerSave();
        return next;
      });
    },
    [triggerSave, nodesRef],
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const { nextChanges, hasSnapChange, guidelines } = applySnapChanges(
          changes,
          nds,
        );
        if (guidelines) setGuidelines(guidelines);
        if (
          !hasSnapChange &&
          changes.some((c) => c.type === "position" && !c.dragging)
        ) {
          clearGuidelines();
        }

        const nextNodes = applyNodeChanges(nextChanges, nds) as CanvasXYNode[];
        syncDimensions(nextNodes, changes);

        nodesRef.current = nextNodes;
        if (shouldTriggerSave(changes)) triggerSave();
        return nextNodes;
      });
    },
    [triggerSave, setGuidelines, clearGuidelines, nodesRef],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const nextEdges = applyEdgeChanges(changes, eds);
        edgesRef.current = nextEdges;
        if (changes.some((c) => c.type !== "select")) {
          triggerSave();
        }
        return nextEdges;
      });
    },
    [triggerSave, edgesRef],
  );

  const dismissGhost = useCallback(() => {
    setNodes((nds) => {
      const next = nds.filter((n) => !n.id.startsWith("ghost-"));
      nodesRef.current = next;
      return next;
    });
    setEdges((eds) => {
      const next = eds.filter((e) => !e.id.startsWith("ghost-"));
      edgesRef.current = next;
      return next;
    });
  }, [nodesRef, edgesRef]);

  const { onConnect, onConnectStart, onConnectEnd } = useMemo(
    () =>
      createGhostHandlers({
        reactFlowInstance,
        connectingNodeRef,
        setNodes,
        setEdges,
        nodesRef,
        edgesRef,
        saveCanvasNow,
        dismissGhost,
      }),
    [
      reactFlowInstance,
      connectingNodeRef,
      setNodes,
      setEdges,
      nodesRef,
      edgesRef,
      saveCanvasNow,
      dismissGhost,
    ],
  );

  // Obsidian UX: Hold Alt/Option while dragging to duplicate
  const onNodeDragStart = useCallback(
    (event: MouseEvent | TouchEvent, node: CanvasXYNode) => {
      if ("altKey" in event && event.altKey) {
        const cloneId = `${node.type?.replace("canvas", "").toLowerCase() || "card"}-${Date.now()}`;
        const cloneNode: CanvasXYNode = {
          ...node,
          id: cloneId,
          position: { ...node.position },
          selected: false,
        };
        setNodes((nds) => {
          const next = [...nds, cloneNode];
          nodesRef.current = next;
          saveCanvasNow();
          return next;
        });
      }
    },
    [saveCanvasNow, nodesRef],
  );

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, _node: CanvasXYNode) => {
      clearGuidelines();
      saveCanvasNow();
    },
    [saveCanvasNow, clearGuidelines],
  );

  const { handleAddTextCard, handleAddGroup, handleAddLink, onDrop } =
    useMemo(
      () =>
        createNodeCreators({
          reactFlowInstance,
          setNodes,
          nodesRef,
          saveCanvasNow,
        }),
      [reactFlowInstance, setNodes, nodesRef, saveCanvasNow],
    );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  // Obsidian UX: Double-click empty canvas to create text card
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("react-flow__pane")) {
        const pos = reactFlowInstance.screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        });
        handleAddTextCard(pos.x, pos.y);
      }
    },
    [reactFlowInstance, handleAddTextCard],
  );

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    dismissGhost,
    updateText,
    updateUrl,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onConnectStart,
    onConnectEnd,
    onNodeDragStart,
    onNodeDragStop,
    onDragOver,
    onDrop,
    handleAddTextCard,
    handleAddGroup,
    handleAddLink,
    handleDoubleClick,
  };
}