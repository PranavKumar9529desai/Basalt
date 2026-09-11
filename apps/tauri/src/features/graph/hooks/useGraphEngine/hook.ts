//! `useGraphEngine` — composes the sub-modules over one `EngineContext`.
//!
//! The hook body runs every render (refs/state are declared in
//! `createEngineContext`, so hook order stays stable); the heavyweight work
//! lives in a single mount-only effect keyed on `reloadNonce` (Retry) that
//! wires scene → loader → rebuild → camera → interactions → draw loop, each
//! returning its own cleanup.

import { useCallback, useEffect } from "react";
import type { EngineContext, GraphEngine, GraphEngineOptions } from "./context";
import { createEngineContext } from "./context";
import { initScene } from "./scene";
import { initLoader } from "./loader";
import { initRebuild } from "./rebuild";
import { initCamera } from "./camera";
import { bindInteractions } from "./interactions";
import { startDrawLoop } from "./draw";
import { setRecolor, useThemeObserver } from "./theme";

export function useGraphEngine(opts: GraphEngineOptions): GraphEngine {
  // Every ctx member is a stable ref/setter; the callbacks and effect below
  // intentionally close over the per-render ctx object and have `[]` (or
  // ref-only) dep lists — the changing inputs are captured in the effect's
  // four deps, identical to the pre-split hook.
  /* eslint-disable react-hooks/exhaustive-deps -- ctx is a bag of stable refs */
  const ctx: EngineContext = createEngineContext(opts);

  // Live call-through: recolor reads refs at call time, so the leaf can
  // invoke it after render without re-mounting the engine.
  ctx.recolorRef.current = () => setRecolor(ctx);

  useThemeObserver(ctx);

  // Engine lifecycle: renderer, worker, data store, subset rebuild, the rAF
  // draw loop, and the canvas event surface. Everything here is per-instance
  // and re-runs only on Retry (`reloadNonce`).
  useEffect(() => {
    const scene = initScene(ctx);
    if (!scene) return;
    const loader = initLoader(ctx);
    initRebuild(ctx);
    initCamera(ctx);
    const interactions = bindInteractions(ctx);
    const draw = startDrawLoop(ctx);

    return () => {
      scene.destroy();
      draw.destroy();
      loader.destroy();
      interactions.destroy();
      ctx.rendererRef.current?.dispose();
    };
  }, [ctx.reloadNonce, ctx.setQuery, ctx.controls, ctx.openNoteRef]);

  const recolor = useCallback(() => ctx.recolorRef.current?.(), []);
  const rebuild = useCallback(() => ctx.rebuildRef.current?.(), []);
  const centerOn = useCallback(
    (full: number) => ctx.centerOnRef.current(full),
    [],
  );
  const refit = useCallback(() => {
    ctx.viewRef.current.fitted = false;
    ctx.dirtyRef.current = true;
  }, []);
  const retry = useCallback(() => {
    ctx.setError(null);
    ctx.setLoaded(false);
    ctx.setReloadNonce((value) => value + 1);
  }, []);
  const closeMenu = useCallback(() => ctx.setMenu(null), []);

  return {
    glRef: ctx.glRef,
    labelRef: ctx.labelRef,
    wrapRef: ctx.wrapRef,
    pathsRef: ctx.pathsRef,
    viewRef: ctx.viewRef,
    hover: ctx.hover,
    preview: ctx.preview,
    menu: ctx.menu,
    loaded: ctx.loaded,
    error: ctx.error,
    recolor,
    rebuild,
    centerOn,
    refit,
    retry,
    closeMenu,
  };
  /* eslint-enable react-hooks/exhaustive-deps */
}
