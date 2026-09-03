import { type Extension, Facet } from "@codemirror/state";

/**
 * How the shared live-preview engine renders a surface. Mirrors Obsidian's
 * view-mode vocabulary (reading view / live preview / source mode); a single
 * facet so every cursor-gating decoration and block-widget layer can opt into
 * "always fully rendered" without each one re-deriving the mode.
 *
 * - `"live"`    — WYSIWYM editing: raw syntax is revealed on the caret line.
 * - `"reading"` — always fully rendered; the caret never reveals raw syntax.
 * - `"source"`  — (reserved) raw markdown with no decoration.
 */
export type RenderMode = "live" | "reading" | "source";

/** Single source of truth for the current surface's render mode. */
export const renderModeFacet = Facet.define<RenderMode, RenderMode>({
  combine: (values) => values[values.length - 1] ?? "live",
});

/** Force a surface to always fully render (no cursor-based syntax reveal). */
export const renderModeReading: Extension = renderModeFacet.of("reading");
