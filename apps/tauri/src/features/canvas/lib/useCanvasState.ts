import { useCallback, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  type Connection,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type OnConnectStart,
  type OnConnectEnd,
  type ReactFlowInstance,
} from "@xyflow/react";
import { getSmartGuidelines } from "./guidelines";
import type { CanvasXYNode } from "./mapper";
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
        let hasSnapChange = false;
        const nextChanges = changes.map((change) => {
          if (
            change.type === "position" &&
            change.dragging &&
            change.position
          ) {
            const node = nds.find((n) => n.id === change.id);
            if (node) {
              const tempNode: CanvasXYNode = {
                ...node,
                position: change.position,
              };
              const alignment = getSmartGuidelines(tempNode, nds);
              hasSnapChange = true;
              setGuidelines({
                vertical: alignment.verticalLine,
                horizontal: alignment.horizontalLine,
                verticalLines: alignment.verticalLines,
                horizontalLines: alignment.horizontalLines,
              });
              return {
                ...change,
                position: { x: alignment.x, y: alignment.y },
              };
            }
          }
          return change;
        });

        if (
          !hasSnapChange &&
          changes.some((c) => c.type === "position" && !(c as any).dragging)
        ) {
          clearGuidelines();
        }

        const nextNodes = applyNodeChanges(nextChanges, nds) as CanvasXYNode[];

        // Sync style width and height whenever dimensions change
        for (const change of changes) {
          if (change.type === "dimensions" && change.dimensions) {
            const target = nextNodes.find((n) => n.id === change.id);
            if (target) {
              const newW = Math.round(change.dimensions.width);
              const newH = Math.round(change.dimensions.height);
              target.style = {
                ...target.style,
                width: newW,
                height: newH,
              };
              target.measured = {
                width: newW,
                height: newH,
              };
            }
          }
        }

        nodesRef.current = nextNodes;

        const isDragging = changes.some(
          (c) => c.type === "position" && (c as any).dragging,
        );
        const isResizing = changes.some(
          (c) => c.type === "dimensions" && (c as any).resizing === true,
        );
        const isPureSelect = changes.every((c) => c.type === "select");
        const isInitialDimensions = changes.every(
          (c) => c.type === "dimensions" && !(c as any).resizing,
        );

        if (
          !isDragging &&
          !isResizing &&
          !isPureSelect &&
          !isInitialDimensions
        ) {
          triggerSave();
        }

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

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      dismissGhost();
      connectingNodeRef.current = null;
      const strokeColor = "var(--sat-accent-primary, #6366f1)";
      setEdges((eds) => {
        const newEdge: Edge = {
          ...connection,
          id: `edge-${Date.now()}`,
          type: "bezier",
          markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor },
          style: { stroke: strokeColor, strokeWidth: 2 },
        };
        const nextEdges = addEdge(
          newEdge,
          eds.filter((e) => !e.id.startsWith("ghost-")),
        );
        edgesRef.current = nextEdges;
        saveCanvasNow();
        return nextEdges;
      });
    },
    [dismissGhost, saveCanvasNow, edgesRef],
  );

  const commitGhost = useCallback(
    (
      ghostNodeId: string,
      pos: { x: number; y: number },
      sourceId: string,
      sourceHandle?: string,
    ) => {
      const realCardId = `text-${Date.now()}`;
      const realEdgeId = `edge-${Date.now()}`;
      const strokeColor = "var(--sat-accent-primary, #6366f1)";

      const realCard: CanvasXYNode = {
        id: realCardId,
        type: "canvasText",
        position: pos,
        style: { width: 250, height: 140 },
        data: { text: "" },
      };

      const realEdge: Edge = {
        id: realEdgeId,
        source: sourceId,
        sourceHandle: sourceHandle ?? undefined,
        target: realCardId,
        targetHandle: "left",
        type: "bezier",
        markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor },
        style: { stroke: strokeColor, strokeWidth: 2 },
      };

      setNodes((nds) => {
        const filtered = nds.filter((n) => n.id !== ghostNodeId);
        const nextNodes = [...filtered, realCard];
        nodesRef.current = nextNodes;
        return nextNodes;
      });

      setEdges((eds) => {
        const filteredEdges = eds.filter((e) => !e.id.startsWith("ghost-"));
        const nextEdges = [...filteredEdges, realEdge];
        edgesRef.current = nextEdges;
        saveCanvasNow();
        return nextEdges;
      });
    },
    [saveCanvasNow, nodesRef, edgesRef],
  );

  // Obsidian UX: Drag edge into empty space shows a ghost preview card
  const onConnectStart: OnConnectStart = useCallback(
    (_, { nodeId, handleId }) => {
      if (nodeId) {
        connectingNodeRef.current = { nodeId, handleId: handleId ?? null };
      }
    },
    [],
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      if (!connectingNodeRef.current) return;
      const target = event.target as HTMLElement;
      const isPane = target?.classList.contains("react-flow__pane");
      if (isPane) {
        const clientX =
          (event as MouseEvent).clientX ??
          (event as TouchEvent).changedTouches?.[0]?.clientX;
        const clientY =
          (event as MouseEvent).clientY ??
          (event as TouchEvent).changedTouches?.[0]?.clientY;
        if (clientX !== undefined && clientY !== undefined) {
          const pos = reactFlowInstance.screenToFlowPosition({
            x: clientX,
            y: clientY,
          });
          const ghostNodeId = `ghost-${Date.now()}`;
          const sourceId = connectingNodeRef.current.nodeId;
          const sourceHandle = connectingNodeRef.current.handleId ?? undefined;

          const ghostNode: CanvasXYNode = {
            id: ghostNodeId,
            type: "canvasGhost" as any,
            position: { x: pos.x - 110, y: pos.y - 50 },
            style: { width: 220, height: 100 },
            data: {
              onCommit: () =>
                commitGhost(
                  ghostNodeId,
                  { x: pos.x - 125, y: pos.y - 70 },
                  sourceId,
                  sourceHandle,
                ),
              onDismiss: () => dismissGhost(),
            },
          };

          const ghostEdge: Edge = {
            id: `ghost-edge-${Date.now()}`,
            source: sourceId,
            sourceHandle,
            target: ghostNodeId,
            targetHandle: "left",
            type: "bezier",
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "var(--sat-accent-primary, #6366f1)",
            },
            style: {
              stroke: "var(--sat-accent-primary, #6366f1)",
              strokeWidth: 2,
              strokeDasharray: "5,5",
            },
          };

          setNodes((nds) => {
            const next = [
              ...nds.filter((n) => !n.id.startsWith("ghost-")),
              ghostNode,
            ];
            nodesRef.current = next;
            return next;
          });
          setEdges((eds) => {
            const next = [
              ...eds.filter((e) => !e.id.startsWith("ghost-")),
              ghostEdge,
            ];
            edgesRef.current = next;
            return next;
          });
        }
      }
      connectingNodeRef.current = null;
    },
    [reactFlowInstance, commitGhost, dismissGhost, nodesRef, edgesRef],
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

  // Creation helpers
  const handleAddTextCard = useCallback(
    (wx?: number, wy?: number) => {
      const center = reactFlowInstance.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });

      const newNode: CanvasXYNode = {
        id: `text-${Date.now()}`,
        type: "canvasText",
        position: { x: wx ?? center.x, y: wy ?? center.y },
        style: { width: 250, height: 140 },
        data: { text: "New Note" },
      };

      setNodes((nds) => {
        const next = [...nds, newNode];
        nodesRef.current = next;
        saveCanvasNow();
        return next;
      });
    },
    [reactFlowInstance, saveCanvasNow, nodesRef],
  );

  const handleAddGroup = useCallback(() => {
    const center = reactFlowInstance.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const newGroup: CanvasXYNode = {
      id: `group-${Date.now()}`,
      type: "canvasGroup",
      position: { x: center.x, y: center.y },
      style: { width: 400, height: 300, zIndex: -1 },
      data: { label: "Group" },
    };
    setNodes((nds) => {
      const next = [...nds, newGroup];
      nodesRef.current = next;
      saveCanvasNow();
      return next;
    });
  }, [reactFlowInstance, saveCanvasNow, nodesRef]);

  const handleAddLink = useCallback(() => {
    const center = reactFlowInstance.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const newLink: CanvasXYNode = {
      id: `link-${Date.now()}`,
      type: "canvasLink",
      position: { x: center.x, y: center.y },
      style: { width: 260, height: 100 },
      data: { url: "https://" },
    };
    setNodes((nds) => {
      const next = [...nds, newLink];
      nodesRef.current = next;
      saveCanvasNow();
      return next;
    });
  }, [reactFlowInstance, saveCanvasNow, nodesRef]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
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
          setNodes((nds) => {
            const next = [...nds, newLink];
            nodesRef.current = next;
            saveCanvasNow();
            return next;
          });
          return;
        } else if (droppedText.endsWith(".md") || droppedText.includes("/")) {
          const newFile: CanvasXYNode = {
            id: `file-${Date.now()}`,
            type: "canvasFile",
            position: { x: pos.x - 150, y: pos.y - 110 },
            style: { width: 300, height: 220 },
            data: { file: droppedText },
          };
          setNodes((nds) => {
            const next = [...nds, newFile];
            nodesRef.current = next;
            saveCanvasNow();
            return next;
          });
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
        setNodes((nds) => {
          const next = [...nds, newFile];
          nodesRef.current = next;
          saveCanvasNow();
          return next;
        });
      }
    },
    [reactFlowInstance, saveCanvasNow, nodesRef],
  );

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