// Store/snapshot persistence for the graph leaf (ADR-038 §3 graph split):
// read + debounced write of the filter/local/display controls and the camera
// (zoom + offset) under `graphState:<tab path>` in the workspace store.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GraphColorMode } from "../components/GraphControls";
import type { ViewTransform } from "./geometry";
import type { Ref } from "./interactions";

export interface PersistedGraphState {
  query: string;
  local: boolean;
  localDepth: number;
  localRoot: string | null;
  showOrphans: boolean;
  showAttach: boolean;
  colorMode: GraphColorMode;
  controlsOpen: boolean;
  camera?: { scale: number; ox: number; oy: number };
}

export interface PersistenceValues {
  query: string;
  local: boolean;
  localDepth: number;
  localRoot: string | null;
  showOrphans: boolean;
  showAttach: boolean;
  colorMode: GraphColorMode;
  controlsOpen: boolean;
}

export function buildPersistedState(
  values: PersistenceValues,
  camera: ViewTransform,
): PersistedGraphState {
  return {
    query: values.query,
    local: values.local,
    localDepth: values.localDepth,
    localRoot: values.localRoot,
    showOrphans: values.showOrphans,
    showAttach: values.showAttach,
    colorMode: values.colorMode,
    controlsOpen: values.controlsOpen,
    camera: { scale: camera.scale, ox: camera.ox, oy: camera.oy },
  };
}

/** Restore a saved snapshot: applies state + camera, then bridges readiness. */
export function usePersistedGraphState(
  tabPath: string,
  values: PersistenceValues,
  viewRef: Ref<ViewTransform & { fitted: boolean }>,
  onRestore: (saved: PersistedGraphState) => void,
): void {
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const {
    query,
    local,
    localDepth,
    localRoot,
    showOrphans,
    showAttach,
    colorMode,
    controlsOpen,
  } = values;
  const [stateReady, setStateReady] = useState(false);

  // Read the stored snapshot once per tab path, then surface the controls.
  useEffect(() => {
    let cancelled = false;
    void invoke<Record<string, unknown>>("get_workspace")
      .then((workspace) => {
        if (cancelled) return;
        const saved = workspace[`graphState:${tabPath}`] as
          | PersistedGraphState
          | undefined;
        if (saved) onRestoreRef.current(saved);
        setStateReady(true);
      })
      .catch(() => setStateReady(true));
    return () => {
      cancelled = true;
    };
  }, [tabPath]);

  // Debounced snapshot write whenever a control or the camera changes.
  useEffect(() => {
    if (!stateReady) return;
    const state = buildPersistedState(
      { query, local, localDepth, localRoot, showOrphans, showAttach, colorMode, controlsOpen },
      viewRef.current,
    );
    const timer = window.setTimeout(() => {
      void invoke("set_workspace_key", {
        key: `graphState:${tabPath}`,
        value: state,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    stateReady,
    tabPath,
    query,
    local,
    localDepth,
    localRoot,
    showOrphans,
    showAttach,
    colorMode,
    controlsOpen,
    viewRef,
  ]);
}