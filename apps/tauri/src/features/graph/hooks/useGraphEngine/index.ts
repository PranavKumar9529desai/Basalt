//! The graph leaf's engine hook, split across a subfolder because the hook
//! orchestrates six concerns:
//!
//! - `[scene]` WebGL2 renderer + resize observer
//! - `[loader]` C-ABI wasm worker, snapshot fetch, vault refresh
//! - `[rebuild]` visible/local subset rebuild
//! - `[camera]` fit / center-on-node / projection
//! - `[interactions]` canvas event surface
//! - `[draw]` rAF draw loop (resource rebuild, arrows, labels)
//!
//! `[context]` owns every per-instance ref/state (`EngineContext`) and
//! `[theme]` the color context + theme change tracking. `[hook]` composes
//! them all into `useGraphEngine`.
//!
//! Kept as a folder (not folded into lib/graphWorker.ts) so main-thread code
//! never statically imports the worker module — the worker is loaded only via
//! `new Worker(new URL(...))`, preserving the original side-effect boundary.
export { useGraphEngine } from "./hook";
export type {
  EngineContext,
  GraphEngine,
  GraphEngineControls,
  GraphEngineOptions,
} from "./context";
