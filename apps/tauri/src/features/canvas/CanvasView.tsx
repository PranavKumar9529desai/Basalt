import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useReactFlow,
  ConnectionMode,
  ConnectionLineType,
  SelectionMode,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { LeafProps } from "@workspace/views";

import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasContextMenu, type ContextTarget } from "./CanvasContextMenu";
import { NotePickerModal } from "./components/NotePickerModal";
import { AssetPickerModal } from "./components/AssetPickerModal";

import TextCardNode from "./nodes/TextCardNode";
import FileNode from "./nodes/FileNode";
import GroupNode from "./nodes/GroupNode";
import LinkNode from "./nodes/LinkNode";
import GhostCardNode from "./nodes/GhostCardNode";
import CanvasEdge from "./edges/CanvasEdge";
import GuidelineLines from "./components/GuidelineLines";
import { CanvasContext } from "./CanvasContext";

import { useCanvasState } from "./lib/useCanvasState";
import { useCanvasPersistence } from "./lib/useCanvasPersistence";
import { useCanvasGuidelines } from "./lib/useCanvasGuidelines";
import { useCanvasKeyboard } from "./lib/useCanvasKeyboard";
import { useCanvasSelection } from "./lib/useCanvasSelection";
import { useCanvasModals } from "./lib/useCanvasModals";

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
  const reactFlowInstance = useReactFlow();

  const { saveCanvasNow, triggerSave, loadCanvas, nodesRef, edgesRef } =
    useCanvasPersistence({ tab, reactFlowInstance });
  const { guidelines: guidelineState, setGuidelines, clearGuidelines } =
    useCanvasGuidelines();
  const {
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
  } = useCanvasState({
    reactFlowInstance,
    nodesRef,
    edgesRef,
    saveCanvasNow,
    triggerSave,
    setGuidelines,
    clearGuidelines,
  });
  useCanvasKeyboard({ saveCanvasNow });
  const { handleDeleteSelection, handleGroupSelection } = useCanvasSelection({
    setNodes,
    setEdges,
    nodesRef,
    edgesRef,
    saveCanvasNow,
  });
  const {
    isNotePickerOpen,
    setIsNotePickerOpen,
    isAssetPickerOpen,
    setIsAssetPickerOpen,
    handleSelectNote,
    handleSelectAsset,
  } = useCanvasModals({
    reactFlowInstance,
    setNodes,
    nodesRef,
    saveCanvasNow,
  });

  const [ctxMenu, setCtxMenu] = useState<{
    target: ContextTarget;
    anchor: { x: number; y: number };
  } | null>(null);

  // Populate node/edge state once the canvas document has been loaded
  useEffect(() => {
    loadCanvas().then((loaded) => {
      if (loaded) {
        setNodes(loaded.nodes);
        setEdges(loaded.edges);
      }
    });
  }, [loadCanvas, setNodes, setEdges]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const pos = reactFlowInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      setCtxMenu({
        target: { kind: "background", wx: pos.x, wy: pos.y },
        anchor: { x: e.clientX, y: e.clientY },
      });
    },
    [reactFlowInstance],
  );

  return (
    <CanvasContext.Provider
      value={{ updateText, updateUrl, saveNow: saveCanvasNow }}
    >
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
            clearGuidelines();
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.Bezier}
          connectionLineStyle={{
            stroke: "var(--sat-accent-primary, #6366f1)",
            strokeWidth: 2,
          }}
          defaultEdgeOptions={{
            type: "bezier",
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "var(--sat-accent-primary, #6366f1)",
            },
            style: {
              stroke: "var(--sat-accent-primary, #6366f1)",
              strokeWidth: 2,
            },
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
            verticalLine={guidelineState.vertical}
            horizontalLine={guidelineState.horizontal}
            verticalLines={guidelineState.verticalLines}
            horizontalLines={guidelineState.horizontalLines}
          />
        </ReactFlow>

        <div className="pointer-events-auto">
          <CanvasToolbar
            onAddTextCard={() => handleAddTextCard()}
            onAddNote={() => setIsNotePickerOpen(true)}
            onAddMedia={() => setIsAssetPickerOpen(true)}
            onAddLink={handleAddLink}
            onAddGroup={handleAddGroup}
            onZoomToFit={() =>
              reactFlowInstance.fitView({ padding: 0.2, duration: 200 })
            }
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