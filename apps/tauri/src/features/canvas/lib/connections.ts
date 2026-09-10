import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  addEdge,
  MarkerType,
  type Connection,
  type Edge,
  type OnConnect,
  type OnConnectEnd,
  type OnConnectStart,
  type ReactFlowInstance,
} from "@xyflow/react";
import type { CanvasXYNode } from "./mapper";

const STROKE_COLOR = "var(--sat-accent-primary, #6366f1)";

/** Shape a completed handle-to-handle connection into a bezier edge with the
 * canvas's accent stroke + closed arrowhead. */
export function makeConnectionEdge(connection: Connection): Edge {
  return {
    ...connection,
    id: `edge-${Date.now()}`,
    type: "bezier",
    markerEnd: { type: MarkerType.ArrowClosed, color: STROKE_COLOR },
    style: { stroke: STROKE_COLOR, strokeWidth: 2 },
  };
}

export interface GhostHandlersDeps {
  reactFlowInstance: ReactFlowInstance;
  connectingNodeRef: RefObject<{
    nodeId: string;
    handleId: string | null;
  } | null>;
  setNodes: Dispatch<SetStateAction<CanvasXYNode[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  nodesRef: RefObject<CanvasXYNode[]>;
  edgesRef: RefObject<Edge[]>;
  saveCanvasNow: () => void;
  dismissGhost: () => void;
}

export interface GhostHandlers {
  onConnect: OnConnect;
  onConnectStart: OnConnectStart;
  onConnectEnd: OnConnectEnd;
}

/**
 * The connect gesture end-to-end: obsidian UX — dragging from a node's handle
 * onto empty pane space spawns a ghost preview card connected by a dashed
 * edge; committing turns the ghost into a real text card, dismissing removes
 * it. Dropping onto another node's handle makes a normal edge instead.
 * Factory (not a hook) so the refs pass through explicitly; identity is
 * stable via the caller's useMemo.
 */
export function createGhostHandlers(deps: GhostHandlersDeps): GhostHandlers {
  const {
    reactFlowInstance,
    connectingNodeRef,
    setNodes,
    setEdges,
    nodesRef,
    edgesRef,
    saveCanvasNow,
    dismissGhost,
  } = deps;

  const commitGhost = (
    ghostNodeId: string,
    pos: { x: number; y: number },
    sourceId: string,
    sourceHandle?: string,
  ) => {
    const realCardId = `text-${Date.now()}`;
    const realEdgeId = `edge-${Date.now()}`;

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
      markerEnd: { type: MarkerType.ArrowClosed, color: STROKE_COLOR },
      style: { stroke: STROKE_COLOR, strokeWidth: 2 },
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
  };

  const onConnect: OnConnect = (connection) => {
    dismissGhost();
    connectingNodeRef.current = null;
    setEdges((eds) => {
      const nextEdges = addEdge(
        makeConnectionEdge(connection),
        eds.filter((e) => !e.id.startsWith("ghost-")),
      );
      edgesRef.current = nextEdges;
      saveCanvasNow();
      return nextEdges;
    });
  };

  const onConnectStart: OnConnectStart = (_, { nodeId, handleId }) => {
    if (nodeId) {
      connectingNodeRef.current = { nodeId, handleId: handleId ?? null };
    }
  };

  const onConnectEnd: OnConnectEnd = (event) => {
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
            color: STROKE_COLOR,
          },
          style: {
            stroke: STROKE_COLOR,
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
  };

  return { onConnect, onConnectStart, onConnectEnd };
}
