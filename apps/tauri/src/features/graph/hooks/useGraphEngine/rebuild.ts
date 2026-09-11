//! Visible/local subset rebuild: filter the full graph (query + orphan +
//! attachment gates), narrow to the local BFS neighborhood when enabled,
//! then re-seed the renderer + worker with the resulting subset.

import type { EngineContext } from "./context";
import { buildVisible } from "../../lib/filters";
import { buildSubset, localSubset } from "../../lib/localGraph";
import { buildColorArray } from "../../lib/themeColors";
import { buildColorContext } from "./theme";

/**
 * Rebuild the active subset from the current controls and re-seed the
 * renderer/worker with it. Stored in `ctx.rebuildRef` so the mount effect
 * stays stable; callers invoke it via the hook's stable `rebuild()`.
 */
export function initRebuild(ctx: EngineContext): void {
  const rebuild = () => {
    const paths = ctx.pathsRef.current;
    if (!paths.length) return;
    const c = ctx.controls.current;
    let finalVisible = buildVisible(c.query, {
      paths,
      tags: ctx.tagsRef.current,
      isTag: ctx.isTagRef.current,
      adj: ctx.adjRef.current,
      attach: ctx.attachRef.current,
      showOrphans: c.showOrphans,
      showAttach: c.showAttach,
    });
    // Local graph: keep only nodes within BFS depth of the root note.
    if (c.local) {
      const sub = localSubset(
        finalVisible,
        ctx.adjRef.current,
        c.localRoot ?? c.activeNotePath,
        c.localDepth,
        paths,
      );
      if (sub) finalVisible = sub;
    }
    const subset = buildSubset({
      visible: finalVisible,
      fullEdges: ctx.edgesRef.current,
      fullWeights: ctx.edgeWeightsRef.current,
      scaleInputs: ctx.scaleInputsRef.current,
    });
    const map = subset.map;
    ctx.activeMapRef.current = map;
    ctx.activeEdgesRef.current = Uint32Array.from(subset.edges);
    ctx.activeEdgeWeightsRef.current = Float32Array.from(subset.edgeWeights);
    ctx.edgeFlagsRef.current = new Float32Array(subset.edges.length / 2);
    ctx.edgeFlagsDirtyRef.current = true;
    ctx.activeAdjRef.current = subset.adj;
    ctx.sizesRef.current = subset.sizes;
    // Keep the current camera when narrowing the graph. The initial graph
    // still auto-fits because `fitted` starts false; users can explicitly
    // reframe any subset with the Fit graph action.
    ctx.viewRef.current.fitted =
      ctx.viewRef.current.fitted && map.length > 0;

    // Rebuild renderer color + reset hover flags for the new subset.
    const renderer = ctx.rendererRef.current;
    if (!renderer) return;
    renderer.setSizes(subset.sizes);
    renderer.setColors(
      buildColorArray(map, buildColorContext(ctx)),
    );
    renderer.setEdges(Uint32Array.from(subset.edges), subset.edges.length / 2);
    renderer.setEdgeWeights(Float32Array.from(subset.edgeWeights));
    if (ctx.flagsRef.current.length !== map.length) {
      ctx.flagsRef.current = new Float32Array(map.length);
    } else {
      ctx.flagsRef.current.fill(0);
    }
    ctx.flagsDirtyRef.current = true;
    renderer.setHasHover(false);

    if (!ctx.syntheticRef.current) {
      ctx.workerRef.current?.postMessage({
        action: "build",
        nodeCount: map.length,
        edges: Uint32Array.from(subset.edges),
      });
    }
    ctx.dirtyRef.current = true;
  };
  ctx.rebuildRef.current = rebuild;
}
