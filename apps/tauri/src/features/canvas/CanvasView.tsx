import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useReactFlow,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  ConnectionMode,
  ConnectionLineType,
  type Connection,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  MarkerType
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { LeafProps } from "@workspace/views";

import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasContextMenu, type ContextTarget } from "./CanvasContextMenu";
import { mapToXYFlow, mapToCanvasDocument, type CanvasXYNode } from "./lib/mapper";

import TextCardNode from "./nodes/TextCardNode";
import FileNode from "./nodes/FileNode";
import GroupNode from "./nodes/GroupNode";
import LinkNode from "./nodes/LinkNode";
import CanvasEdge from "./edges/CanvasEdge";

const nodeTypes = {
  canvasText: TextCardNode,
  canvasFile: FileNode,
  canvasGroup: GroupNode,
  canvasLink: LinkNode,
};

const edgeTypes = {
  bezier: CanvasEdge, // We can override the default bezier to add label pill
};

function CanvasFlow({ tab }: { tab: LeafProps["tab"] }) {
  const [nodes, setNodes] = useState<CanvasXYNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [ctxMenu, setCtxMenu] = useState<{ target: ContextTarget; anchor: { x: number; y: number } } | null>(null);
  const reactFlowInstance = useReactFlow();

  const loadCanvas = useCallback(async () => {
    if (!tab.path.endsWith(".canvas")) return;
    try {
      const json: string = await invoke("open_canvas", { path: tab.path });
      const doc = JSON.parse(json);
      const { nodes: xyNodes, edges: xyEdges } = mapToXYFlow(doc);
      setNodes(xyNodes);
      setEdges(xyEdges);
    } catch (e) {
      console.error("Failed to load canvas", e);
    }
  }, [tab.path]);

  useEffect(() => {
    loadCanvas();
  }, [loadCanvas]);

  const saveCanvas = useCallback(async (currentNodes: CanvasXYNode[], currentEdges: Edge[]) => {
    try {
      const doc = mapToCanvasDocument(currentNodes, currentEdges);
      await invoke("save_canvas", { path: tab.path, content: JSON.stringify(doc) });
    } catch (e) {
      console.error("Failed to save canvas", e);
    }
  }, [tab.path]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const nextNodes = applyNodeChanges(changes, nds) as CanvasXYNode[];
        // Debounce or save immediately on meaningful changes. 
        // For simplicity, any change (drag, resize, remove) triggers save.
        // A robust impl would debounce this.
        if (changes.some(c => c.type !== "select" && c.type !== "dimensions")) {
          // Fire and forget save
          requestAnimationFrame(() => saveCanvas(nextNodes, edges));
        }
        return nextNodes;
      });
    },
    [edges, saveCanvas]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const nextEdges = applyEdgeChanges(changes, eds);
        if (changes.some(c => c.type !== "select")) {
          requestAnimationFrame(() => saveCanvas(nodes, nextEdges));
        }
        return nextEdges;
      });
    },
    [nodes, saveCanvas]
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const newEdge: Edge = {
          ...connection,
          id: `edge-${Date.now()}`,
          type: "bezier",
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--sat-accent-primary, #6366f1)" },
          style: { stroke: "var(--sat-accent-primary, #6366f1)", strokeWidth: 2 },
        };
        const nextEdges = addEdge(newEdge, eds);
        requestAnimationFrame(() => saveCanvas(nodes, nextEdges));
        return nextEdges;
      });
    },
    [nodes, saveCanvas]
  );

  // Toolbar Actions
  const handleAddTextCard = useCallback((wx?: number, wy?: number) => {
    const center = reactFlowInstance.screenToFlowPosition({ 
      x: window.innerWidth / 2, 
      y: window.innerHeight / 2 
    });
    
    const newNode: CanvasXYNode = {
      id: `text-${Date.now()}`,
      type: "canvasText",
      position: { x: wx ?? center.x, y: wy ?? center.y },
      style: { width: 250, height: 150 },
      data: { text: "New Note" },
    };
    
    setNodes(nds => {
      const next = [...nds, newNode];
      requestAnimationFrame(() => saveCanvas(next, edges));
      return next;
    });
  }, [reactFlowInstance, edges, saveCanvas]);

  const handleDeleteSelection = useCallback(() => {
    setNodes(nds => {
      const nextNds = nds.filter(n => !n.selected);
      setEdges(eds => {
        const nextEds = eds.filter(e => !e.selected && nextNds.some(n => n.id === e.source) && nextNds.some(n => n.id === e.target));
        requestAnimationFrame(() => saveCanvas(nextNds, nextEds));
        return nextEds;
      });
      return nextNds;
    });
  }, [saveCanvas]);

  const handleGroupSelection = useCallback(() => {
    // Basic grouping logic
    console.log("Group selection not fully implemented");
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pos = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setCtxMenu({ target: { kind: "background", wx: pos.x, wy: pos.y }, anchor: { x: e.clientX, y: e.clientY } });
  }, [reactFlowInstance]);

  return (
    <div className="relative h-full w-full bg-[var(--sat-surface-0)]" onContextMenu={handleContextMenu}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={{ stroke: "var(--sat-accent-primary, #6366f1)", strokeWidth: 2 }}
        defaultEdgeOptions={{
          type: "bezier",
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--sat-accent-primary, #6366f1)" },
          style: { stroke: "var(--sat-accent-primary, #6366f1)", strokeWidth: 2 },
        }}
        fitView
        minZoom={0.1}
        maxZoom={4}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
      </ReactFlow>

      <div className="pointer-events-auto">
        <CanvasToolbar
          onAddTextCard={() => handleAddTextCard()}
          onAddNote={() => console.log("Add note")}
          onDeleteSelection={handleDeleteSelection}
          onGroupSelection={handleGroupSelection}
          onZoomToFit={() => reactFlowInstance.fitView()}
          onZoomIn={() => reactFlowInstance.zoomIn()}
          onZoomOut={() => reactFlowInstance.zoomOut()}
        />
        <CanvasContextMenu
          target={ctxMenu?.target ?? null}
          anchor={ctxMenu?.anchor ?? null}
          onClose={() => setCtxMenu(null)}
          onAddTextCard={(wx, wy) => handleAddTextCard(wx, wy)}
          onDeleteSelection={handleDeleteSelection}
          onGroupSelection={handleGroupSelection}
        />
      </div>
    </div>
  );
}

export function CanvasView({ tab }: LeafProps) {
  return (
    <ReactFlowProvider>
      <CanvasFlow tab={tab} />
    </ReactFlowProvider>
  );
}
