// Centralized node-sizing policy for the graph (ADR-021, degree-based sizing).
//
// One pure source of truth mapping a node's "importance" to a drawn diameter in
// CSS px. Keeping it out of Graph/renderer means the scaling law and its
// constants live in exactly one place — unit-testable in isolation and easy to
// expose via settings later (wrap `computeNodeSize` in a `useNodeScale` hook
// then; the function is already the single seam).
//
// importance = link degree for note nodes, note count for tag nodes.
export interface ScaleConfig {
  min: number; // minimum drawn diameter (CSS px) — keeps singletons visible
  max: number; // maximum drawn diameter (CSS px) — matches the renderer zoom clamp
  base: number; // diameter at importance 0
  gain: number; // sqrt gain: hubs grow, but with diminishing returns vs the tail
}

const DEFAULT_SCALE: ScaleConfig = {
  min: 2.6,
  max: 22,
  base: 5.2,
  gain: 1.3,
};

export function computeNodeSize(
  importance: number,
  cfg: ScaleConfig = DEFAULT_SCALE,
): number {
  const d = cfg.base + cfg.gain * Math.sqrt(Math.max(0, importance));
  return Math.min(cfg.max, Math.max(cfg.min, d));
}
