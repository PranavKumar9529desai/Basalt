/**
 * Drawing canvas background plumbing (transparent-canvas strategy).
 *
 * The live canvas is ALWAYS rendered with a transparent background. Excalidraw's
 * renderer treats the literal string "transparent" as "clear, paint nothing"
 * (`bootstrapCanvas` in renderer/helpers.ts), so the editor pane behind the
 * wrapper — `bg-[var(--sat-surface-1)]` in `DrawingView` — shows through and
 * *is* the canvas background. The drawing feature therefore holds no colour,
 * follows the selected theme automatically, and needs no theme-switch sync.
 *
 * Solid backgrounds are baked only at export time, from the live theme token.
 */

/** Canvas background value persisted in scenes and passed to Excalidraw. */
export const CANVAS_BG = "transparent" as const;

/** Fallback surface colour for SSR / tests without a DOM (export path only). */
const FALLBACK_SURFACE = "#0d0e12";

/** Read the editor surface token (`--sat-surface-1`) from the DOM. */
export function getSurfaceColor(): string {
  if (typeof document === "undefined") return FALLBACK_SURFACE;
  return (
    window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--sat-surface-1")
      .trim() || FALLBACK_SURFACE
  );
}

/** A fresh empty scene whose canvas is transparent (theme shows through). */
export function makeEmptySceneJson(): string {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "basalt",
    elements: [],
    appState: {
      viewBackgroundColor: CANVAS_BG,
      gridSize: 20,
    },
    files: {},
  });
}

// ---------------------------------------------------------------------------
// Dark-mode pre-inversion (upstream Excalidraw math, re-implemented locally)
//
// Excalidraw's dark theme paints every colour — including the canvas
// background — through `applyDarkModeFilter` (93% invert + 180° hue rotate;
// packages/common/src/colors.ts). Those helpers are NOT exported from the
// published @excalidraw/excalidraw bundle (verified: no `./common/*` runtime
// export), so we re-implement the exact arithmetic. To export a solid
// background that matches the theme token, feed the exporter
// `darkModePreInvert(token)` — its own filter then recovers the token colour.
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Invalid hex colour for pre-inversion: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(clamp(v, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** The 180° hue-rotation matrix used by Excalidraw's cssHueRotate. */
function cssHueRotate(
  red: number,
  green: number,
  blue: number,
): { r: number; g: number; b: number } {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  // 180°: cos(π) = -1, sin(π) = 0
  const matrix = [
    -0.574,
    1.43,
    0.144, //
    0.426,
    0.43,
    0.144, //
    0.426,
    1.43,
    -0.856, //
  ];
  return {
    r: Math.round(
      clamp((r * matrix[0] + g * matrix[1] + b * matrix[2]) * 255, 0, 255),
    ),
    g: Math.round(
      clamp((r * matrix[3] + g * matrix[4] + b * matrix[5]) * 255, 0, 255),
    ),
    b: Math.round(
      clamp((r * matrix[6] + g * matrix[7] + b * matrix[8]) * 255, 0, 255),
    ),
  };
}

/**
 * Compute the colour that, passed through Excalidraw's dark-mode filter
 * (93% invert + 180° hue rotate), yields exactly `hex`. Mirrors upstream
 * `removeDarkModeFilter` (DARK_MODE_FILTER_INVERT_PERCENT = 93).
 */
export function darkModePreInvert(hex: string): string {
  const [r, g, b] = parseHex(hex);
  // 180° hue rotation is its own inverse; undo the invert per channel.
  const rotated = cssHueRotate(r, g, b);
  const restore = (c: number) =>
    Math.round(clamp((c - 255 * 0.93) / (1 - 2 * 0.93), 0, 255));
  return toHex(restore(rotated.r), restore(rotated.g), restore(rotated.b));
}
