//! The C-ABI wasm worker + the full-graph snapshot store: fetch via
//! `get_graph`, decode the binary snapshot into the context's full-graph refs,
//! and refresh on `vault://file-changed` (debounced 150 ms).

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { EngineContext } from "./context";
import { decodeBinaryGraphSnapshot, snapshotToGraphData } from "../../lib/graphData";

export interface Loader {
  /** Terminate the worker, stop listening, clear the refresh timer. */
  destroy: () => void;
  /** Re-fetch the vault snapshot and re-seed the worker; sets `loaded`. */
  reload: () => Promise<void>;
}

/**
 * Create the worker, fetch the initial snapshot, and subscribe to vault
 * changes. The worker stays a dynamic `new Worker(new URL(...))` import so
 * main-thread code never statically bundles it.
 */
export function initLoader(ctx: EngineContext): Loader {
  const worker = new Worker(new URL("../../lib/graphWorker.ts", import.meta.url), {
    type: "module",
  });
  ctx.workerRef.current = worker;
  worker.onmessage = (e: MessageEvent) => {
    const data = e.data;
    if ("action" in data) {
      // The only union member with `action` is the error message.
      ctx.setError((data as { message: string }).message);
      return;
    }
    ctx.frameRef.current = data;
    ctx.dirtyRef.current = true;
  };

  const loadSnapshot = async () => {
    try {
      const buf = await invoke<ArrayBuffer>("get_graph");
      if (!buf || buf.byteLength < 24) {
        throw new Error("No graph data returned from vault");
      }
      const g = decodeBinaryGraphSnapshot(buf);
      if (g.node_count === 0) {
        throw new Error("No notes are available to graph");
      }
      const d = snapshotToGraphData(g);
      ctx.pathsRef.current = d.paths;
      ctx.tagsRef.current = d.tags;
      ctx.attachRef.current = d.attach;
      ctx.isTagRef.current = d.isTag;
      ctx.edgesRef.current = d.edges;
      ctx.edgeWeightsRef.current = d.edgeWeights;
      ctx.clusterRef.current = d.cluster;
      ctx.clusterCountRef.current = d.clusterCount;
      ctx.adjRef.current = d.adj;
      ctx.scaleInputsRef.current = d.scaleInputs;
      ctx.syntheticRef.current = false;
      console.log(
        `[graph] real vault graph: ${g.node_count} nodes, ${g.edges.length / 2} edges`,
      );
      ctx.setError(null);
    } catch (err) {
      console.error("[graph] get_graph failed:", err);
      ctx.syntheticRef.current = false;
      ctx.pathsRef.current = [];
      ctx.tagsRef.current = [];
      ctx.attachRef.current = [];
      ctx.edgesRef.current = new Uint32Array(0);
      ctx.edgeWeightsRef.current = new Float32Array(0);
      ctx.adjRef.current = [];
      ctx.scaleInputsRef.current = new Float32Array(0);
      ctx.isTagRef.current = [];
      ctx.activeMapRef.current = [];
      ctx.activeEdgesRef.current = new Uint32Array(0);
      ctx.activeEdgeWeightsRef.current = new Float32Array(0);
      ctx.activeAdjRef.current = [];
      ctx.frameRef.current = null;
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
    ctx.setLoaded(true);
  };

  const reload = async () => {
    await loadSnapshot();
    ctx.rebuildRef.current();
  };

  let refreshTimer = 0;
  void loadSnapshot();
  const unlisten = listen("vault://file-changed", () => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      ctx.setLoaded(false);
      void reload();
    }, 150);
  });

  return {
    destroy: () => {
      worker.terminate();
      window.clearTimeout(refreshTimer);
      void unlisten.then((dispose) => dispose());
    },
    reload,
  };
}