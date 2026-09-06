import { useCallback, useEffect, useState, useRef } from "react";
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
  SelectionMode,
  type Connection,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type OnConnectStart,
  type OnConnectEnd,
  MarkerType
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { LeafProps } from "@workspace/views";

import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasContextMenu, type ContextTarget } from "./CanvasContextMenu";
import { NotePickerModal } from "./components/NotePickerModal";
import { AssetPickerModal } from "./components/AssetPickerModal";
import { mapToXYFlow, mapToCanvasDocument, type CanvasXYNode } from "./lib/mapper";
import { useLeafServices } from "@workspace/views";

import TextCardNode from "./nodes/TextCardNode";
import FileNode from "./nodes/FileNode";
import GroupNode from "./nodes/GroupNode";
import LinkNode from "./nodes/LinkNode";
import GhostCardNode from "./nodes/GhostCardNode";
import CanvasEdge from "./edges/CanvasEdge";
import { getSmartGuidelines } from "./lib/guidelines";
import GuidelineLines from "./components/GuidelineLines";
import { CanvasContext } from "./CanvasContext";

const nodeTypes = {
  canvasText: TextCardNode,
  canvasFile: FileNode,
  canvasGroup: GroupNode,
  canvasLink: LinkNode,
  canvasGhost: GhostCardNode,
};

const edgeTypes = {
  bezier: CanvasEdge,
};

function CanvasFlow({ tab }: { tab: LeafProps["tab"] }) {
  const [nodes, setNodes] = useState<CanvasXYNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [ctxMenu, setCtxMenu] = useState<{ target: ContextTarget; anchor: { x: number; y: number } } | null>(null);
  const [isNotePickerOpen, setIsNotePickerOpen] = useState(false);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [guidelines, setGuidelines] = useState<{
    vertical: number | null;
    horizontal: number | null;
    verticalLines?: number[];
    horizontalLines?: number[];
  }>({
    vertical: null,
    horizontal: null,
    verticalLines: [],
    horizontalLines: [],
  });
  const reactFlowInstance = useReactFlow();
  const connectingNodeRef = useRef<{ nodeId: string; handleId: string | null } | null>(null);

  let services: ReturnType<typeof useLeafServices> | null = null;
  try {
    services = useLeafServices();
  } catch {
    // Leaf services may be omitted in isolated unit tests
  }
  const servicesRef = useRef(services);
  servicesRef.current = services;

  const nodesRef = useRef<CanvasXYNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadedRef = useRef(false);
  const isDirtyRef = useRef(false);

  nodesRef.current = nodes;
  edgesRef.current = edges;

  const saveCanvasNow = useCallback(async () => {
    // Guard 1: Never save if the canvas has not finished initial loading
    if (!isLoadedRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    try {
      const doc = mapToCanvasDocument(nodesRef.current, edgesRef.current);
      await invoke("save_canvas", { path: tab.path, content: JSON.stringify(doc) });
      isDirtyRef.current = false;
      servicesRef.current?.markTabDirty(tab.id, false);
    } catch (e) {
      console.error("Failed to save canvas", e);
    }
  }, [tab.path, tab.id]);

  const triggerSave = useCallback(() => {
    if (!isLoadedRef.current) return;
    isDirtyRef.current = true;
    servicesRef.current?.markTabDirty(tab.id, true);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      saveCanvasNow();
    }, 500);
  }, [saveCanvasNow, tab.id]);

  const loadCanvas = useCallback(async () => {
    if (!tab.path.endsWith(".canvas")) return;
    try {
      const json: string = await invoke("open_canvas", { path: tab.path });
      const doc = JSON.parse(json);
      const { nodes: xyNodes, edges: xyEdges } = mapToXYFlow(doc);
      nodesRef.current = xyNodes;
      edgesRef.current = xyEdges;
      setNodes(xyNodes);
      setEdges(xyEdges);
      isLoadedRef.current = true;
      isDirtyRef.current = false;
      servicesRef.current?.markTabDirty(tab.id, false);

      if (xyNodes.length > 0) {
        requestAnimationFrame(() => {
          reactFlowInstance.fitView({ padding: 0.2, duration: 200 });
        });
      }
    } catch (e) {
      console.error("Failed to load canvas", e);
    }
  }, [tab.path, tab.id, reactFlowInstance]);

  useEffect(() => {
    loadCanvas();
  }, [loadCanvas]);

  // Flush pending save on unmount / tab close ONLY if loaded AND dirty
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      // Guard 2: Never flush on unmount unless canvas was loaded AND has unsaved edits
      if (isLoadedRef.current && isDirtyRef.current) {
        const doc = mapToCanvasDocument(nodesRef.current, edgesRef.current);
        invoke("save_canvas", { path: tab.path, content: JSON.stringify(doc) }).catch(console.error);
        servicesRef.current?.markTabDirty(tab.id, false);
      }
    };
  }, [tab.path, tab.id]);

  // Handle Ctrl+S / Cmd+S and global save actions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        saveCanvasNow();
      }
    };
    const handleCustomSave = () => {
      saveCanvasNow();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("basalt:save-active", handleCustomSave);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("basalt:save-active", handleCustomSave);
    };
  }, [saveCanvasNow]);

  const updateText = useCallback(
    (id: string, text: string) => {
      setNodes((nds) => {
        const next = nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, text } } : n));
        nodesRef.current = next;
        triggerSave();
        return next;
      });
    },
    [triggerSave]
  );

  const updateUrl = useCallback(
    (id: string, url: string) => {
      setNodes((nds) => {
        const next = nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, url } } : n));
        nodesRef.current = next;
        triggerSave();
        return next;
      });
    },
    [triggerSave]
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        let hasSnapChange = false;
        const nextChanges = changes.map((change) => {
          if (change.type === "position" && change.dragging && change.position) {
            const node = nds.find((n) => n.id === change.id);
            if (node) {
              const tempNode: CanvasXYNode = { ...node, position: change.position };
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

        if (!hasSnapChange && changes.some((c) => c.type === "position" && !(c as any).dragging)) {
          setGuidelines({ vertical: null, horizontal: null, verticalLines: [], horizontalLines: [] });
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

        const isDragging = changes.some((c) => c.type === "position" && (c as any).dragging);
        const isResizing = changes.some((c) => c.type === "dimensions" && (c as any).resizing === true);
        const isPureSelect = changes.every((c) => c.type === "select");
        const isInitialDimensions = changes.every((c) => c.type === "dimensions" && !(c as any).resizing);

        if (!isDragging && !isResizing && !isPureSelect && !isInitialDimensions) {
          triggerSave();
        }

        return nextNodes;
      });
    },
    [triggerSave]
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
    [triggerSave]
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
  }, []);

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
        const nextEdges = addEdge(newEdge, eds.filter((e) => !e.id.startsWith("ghost-")));
        edgesRef.current = nextEdges;
        saveCanvasNow();
        return nextEdges;
      });
    },
    [dismissGhost, saveCanvasNow]
  );

  const commitGhost = useCallback(
    (ghostNodeId: string, pos: { x: number; y: number }, sourceId: string, sourceHandle?: string) => {
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
    [saveCanvasNow]
  );

  // Obsidian UX: Drag edge into empty space shows a ghost preview card
  const onConnectStart: OnConnectStart = useCallback((_, { nodeId, handleId }) => {
    if (nodeId) {
      connectingNodeRef.current = { nodeId, handleId: handleId ?? null };
    }
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      if (!connectingNodeRef.current) return;
      const target = event.target as HTMLElement;
      const isPane = target?.classList.contains("react-flow__pane");
      if (isPane) {
        const clientX = (event as MouseEvent).clientX ?? (event as TouchEvent).changedTouches?.[0]?.clientX;
        const clientY = (event as MouseEvent).clientY ?? (event as TouchEvent).changedTouches?.[0]?.clientY;
        if (clientX !== undefined && clientY !== undefined) {
          const pos = reactFlowInstance.screenToFlowPosition({ x: clientX, y: clientY });
          const ghostNodeId = `ghost-${Date.now()}`;
          const sourceId = connectingNodeRef.current.nodeId;
          const sourceHandle = connectingNodeRef.current.handleId ?? undefined;

          const ghostNode: CanvasXYNode = {
            id: ghostNodeId,
            type: "canvasGhost" as any,
            position: { x: pos.x - 110, y: pos.y - 50 },
            style: { width: 220, height: 100 },
            data: {
              onCommit: () => commitGhost(ghostNodeId, { x: pos.x - 125, y: pos.y - 70 }, sourceId, sourceHandle),
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
            markerEnd: { type: MarkerType.ArrowClosed, color: "var(--sat-accent-primary, #6366f1)" },
            style: { stroke: "var(--sat-accent-primary, #6366f1)", strokeWidth: 2, strokeDasharray: "5,5" },
          };

          setNodes((nds) => {
            const next = [...nds.filter((n) => !n.id.startsWith("ghost-")), ghostNode];
            nodesRef.current = next;
            return next;
          });
          setEdges((eds) => {
            const next = [...eds.filter((e) => !e.id.startsWith("ghost-")), ghostEdge];
            edgesRef.current = next;
            return next;
          });
        }
      }
      connectingNodeRef.current = null;
    },
    [reactFlowInstance, commitGhost, dismissGhost]
  );

  // Obsidian UX: Hold Alt/Option while dragging to duplicate
  const onNodeDragStart = useCallback((event: MouseEvent | TouchEvent, node: CanvasXYNode) => {
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
  }, [saveCanvasNow]);

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, _node: CanvasXYNode) => {
      setGuidelines({ vertical: null, horizontal: null, verticalLines: [], horizontalLines: [] });
      saveCanvasNow();
    },
    [saveCanvasNow]
  );

  // Creation helpers
  const handleAddTextCard = useCallback((wx?: number, wy?: number) => {
    const center = reactFlowInstance.screenToFlowPosition({ 
      x: window.innerWidth / 2, 
      y: window.innerHeight / 2 
    });
    
    const newNode: CanvasXYNode = {
      id: `text-${Date.now()}`,
      type: "canvasText",
      position: { x: wx ?? center.x, y: wy ?? center.y },
      style: { width: 250, height: 140 },
      data: { text: "New Note" },
    };
    
    setNodes(nds => {
      const next = [...nds, newNode];
      nodesRef.current = next;
      saveCanvasNow();
      return next;
    });
  }, [reactFlowInstance, saveCanvasNow]);

  const handleAddGroup = useCallback(() => {
    const center = reactFlowInstance.screenToFlowPosition({ 
      x: window.innerWidth / 2, 
      y: window.innerHeight / 2 
    });
    const newGroup: CanvasXYNode = {
      id: `group-${Date.now()}`,
      type: "canvasGroup",
      position: { x: center.x, y: center.y },
      style: { width: 400, height: 300, zIndex: -1 },
      data: { label: "Group" },
    };
    setNodes(nds => {
      const next = [...nds, newGroup];
      nodesRef.current = next;
      saveCanvasNow();
      return next;
    });
  }, [reactFlowInstance, saveCanvasNow]);

  const handleAddLink = useCallback(() => {
    const center = reactFlowInstance.screenToFlowPosition({ 
      x: window.innerWidth / 2, 
      y: window.innerHeight / 2 
    });
    const newLink: CanvasXYNode = {
      id: `link-${Date.now()}`,
      type: "canvasLink",
      position: { x: center.x, y: center.y },
      style: { width: 260, height: 100 },
      data: { url: "https://" },
    };
    setNodes(nds => {
      const next = [...nds, newLink];
      nodesRef.current = next;
      saveCanvasNow();
      return next;
    });
  }, [reactFlowInstance, saveCanvasNow]);

  const handleSelectNote = useCallback((note: { name: string; path: string }) => {
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
  }, [reactFlowInstance, saveCanvasNow]);

  const handleSelectAsset = useCallback((asset: { rel_path: string; abs_path: string; file_type: string }) => {
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
  }, [reactFlowInstance, saveCanvasNow]);

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
        if (droppedText.startsWith("http://") || droppedText.startsWith("https://")) {
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
    [reactFlowInstance, saveCanvasNow]
  );

  const handleDeleteSelection = useCallback(() => {
    setNodes(nds => {
      const nextNds = nds.filter(n => !n.selected);
      nodesRef.current = nextNds;
      setEdges(eds => {
        const nextEds = eds.filter(e => !e.selected && nextNds.some(n => n.id === e.source) && nextNds.some(n => n.id === e.target));
        edgesRef.current = nextEds;
        saveCanvasNow();
        return nextEds;
      });
      return nextNds;
    });
  }, [saveCanvasNow]);

  const handleGroupSelection = useCallback(() => {
    console.log("Group selection not fully implemented");
  }, []);

  // Obsidian UX: Double-click empty canvas to create text card
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains("react-flow__pane")) {
      const pos = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      handleAddTextCard(pos.x, pos.y);
    }
  }, [reactFlowInstance, handleAddTextCard]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pos = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setCtxMenu({ target: { kind: "background", wx: pos.x, wy: pos.y }, anchor: { x: e.clientX, y: e.clientY } });
  }, [reactFlowInstance]);

  return (
    <CanvasContext.Provider value={{ updateText, updateUrl, saveNow: saveCanvasNow }}>
      <div
        className="relative h-full w-full bg-[var(--sat-surface-0)]"
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={() => {
            dismissGhost();
            setGuidelines({ vertical: null, horizontal: null, verticalLines: [], horizontalLines: [] });
          }}
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
          onDragOver={onDragOver}
          onDrop={onDrop}
          selectionMode={SelectionMode.Partial}
          selectionOnDrag={true}
          panOnDrag={[1, 2]}
          panActivationKeyCode="Space"
          snapToGrid={true}
          snapGrid={[12, 12]}
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
          minZoom={0.1}
          maxZoom={4}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
          <GuidelineLines
            verticalLine={guidelines.vertical}
            horizontalLine={guidelines.horizontal}
            verticalLines={guidelines.verticalLines}
            horizontalLines={guidelines.horizontalLines}
          />
        </ReactFlow>

        <div className="pointer-events-auto">
          <CanvasToolbar
            onAddTextCard={() => handleAddTextCard()}
            onAddNote={() => setIsNotePickerOpen(true)}
            onAddMedia={() => setIsAssetPickerOpen(true)}
            onAddLink={handleAddLink}
            onAddGroup={handleAddGroup}
            onZoomToFit={() => reactFlowInstance.fitView({ padding: 0.2, duration: 200 })}
          />
          <CanvasContextMenu
            target={ctxMenu?.target ?? null}
            anchor={ctxMenu?.anchor ?? null}
            onClose={() => setCtxMenu(null)}
            onAddTextCard={(wx, wy) => handleAddTextCard(wx, wy)}
            onDeleteSelection={handleDeleteSelection}
            onGroupSelection={handleGroupSelection}
          />
          <NotePickerModal
            isOpen={isNotePickerOpen}
            onClose={() => setIsNotePickerOpen(false)}
            onSelect={handleSelectNote}
          />
          <AssetPickerModal
            isOpen={isAssetPickerOpen}
            onClose={() => setIsAssetPickerOpen(false)}
            onSelect={handleSelectAsset}
          />
        </div>
      </div>
    </CanvasContext.Provider>
  );
}

export function CanvasView({ tab }: LeafProps) {
  return (
    <ReactFlowProvider>
      <CanvasFlow tab={tab} />
    </ReactFlowProvider>
  );
}
