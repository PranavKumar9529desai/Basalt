import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Edge, ReactFlowInstance } from "@xyflow/react";
import type { LeafProps, LeafServices } from "@workspace/views";
import { useLeafServices } from "@workspace/views";
import {
  mapToCanvasDocument,
  mapToXYFlow,
  type CanvasXYNode,
} from "../lib/mapper";

export interface UseCanvasPersistenceOptions {
  tab: LeafProps["tab"];
  reactFlowInstance: ReactFlowInstance;
}

export function useCanvasPersistence({
  tab,
  reactFlowInstance,
}: UseCanvasPersistenceOptions) {
  let services: LeafServices | null = null;
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

  const saveCanvasNow = useCallback(async () => {
    // Guard 1: Never save if the canvas has not finished initial loading
    if (!isLoadedRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    try {
      const doc = mapToCanvasDocument(nodesRef.current, edgesRef.current);
      await invoke("save_canvas", {
        path: tab.path,
        content: JSON.stringify(doc),
      });
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
      isLoadedRef.current = true;
      isDirtyRef.current = false;
      servicesRef.current?.markTabDirty(tab.id, false);

      if (xyNodes.length > 0) {
        requestAnimationFrame(() => {
          reactFlowInstance.fitView({ padding: 0.2, duration: 200 });
        });
      }
      return { nodes: xyNodes, edges: xyEdges };
    } catch (e) {
      console.error("Failed to load canvas", e);
    }
  }, [tab.path, tab.id, reactFlowInstance]);

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
        invoke("save_canvas", {
          path: tab.path,
          content: JSON.stringify(doc),
        }).catch(console.error);
        servicesRef.current?.markTabDirty(tab.id, false);
      }
    };
  }, [tab.path, tab.id]);

  return {
    saveCanvasNow,
    triggerSave,
    loadCanvas,
    nodesRef,
    edgesRef,
  };
}