/**
 * Minimal DOM helpers for the drawing canvas background.
 * All parsing/serialization lives in the `basalt-drawing` Rust crate —
 * this module only reads theme tokens from the DOM.
 */

/** Fallback canvas background for SSR / tests where document is unavailable. */
const FALLBACK_BG = "#0d0e12";

/** Read the current editor background from the Basalt theme token. */
export function getEditorBg(): string {
  if (typeof document === "undefined") return FALLBACK_BG;
  return (
    window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--sat-surface-1")
      .trim() || FALLBACK_BG
  );
}

/**
 * Resolve the canvas background colour.
 * Migrates old drawings that still carry Excalidraw's default white (#ffffff)
 * to the current editor surface colour.
 */
export function resolveCanvasBg(storedBg?: string): string {
  return storedBg && storedBg !== "#ffffff" ? storedBg : getEditorBg();
}

/** A fresh empty scene whose canvas background matches the current theme. */
export function makeEmptySceneJson(): string {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "basalt",
    elements: [],
    appState: {
      viewBackgroundColor: getEditorBg(),
      gridSize: 20,
    },
    files: {},
  });
}