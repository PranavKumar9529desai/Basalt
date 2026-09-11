/**
 * CanvasRenderingContext2D.filter polyfill for WebKit.
 *
 * Excalidraw 0.18.1 dark mode CSS-inverts the whole visible canvas
 * (`--theme-filter: invert(93%) hue-rotate(180deg)`) to adapt element colours,
 * then counter-inverts image elements so they stay readable:
 *
 *   ctx.filter = "invert(100%) hue-rotate(180deg) saturate(1.25)"
 *
 * On WebKit/Safari/WebKitGTK — the webview Tauri uses on Linux and macOS —
 * `ctx.filter` is silently disabled: the assignment no-ops, so the counter-
 * invert never happens and images render as colour negatives.
 *
 * Upstream rewrote dark mode to remove this dependency (excalidraw/excalidraw
 * #10578), but that change is NOT in any released @excalidraw/excalidraw npm
 * package (only `@next` and the Obsidian Excalidraw plugin 2.20.0+). Basalt
 * pins 0.18.1, so this shim re-applies the exact counter-filter manually.
 *
 * Scope: it patches the 2D context ONLY when a runtime probe proves ctx.filter
 * is broken, and it intercepts ONLY the one filter string Excalidraw assigns
 * for the image counter-invert. `drawImage` is the sole drawing op executed
 * while that filter is active (renderer/helpers.ts bootstrapCanvas →
 * generateElementCanvas → image case), so nothing else needs interception.
 * Every other assignment — including THEME_FILTER on export canvases — passes
 * through native untouched. Chrome and healthy WebKit builds are unaffected.
 */

// ---------------------------------------------------------------------------
// Pure transform math (unit-testable, no canvas required)
// ---------------------------------------------------------------------------

/** CSS 180° hue-rotation matrix (row-major) — values from upstream cssHueRotate. */
export const HUE_ROTATE_180: readonly number[] = [
  -0.574, 1.43, 0.144,
  0.426, 0.43, 0.144,
  0.426, 1.43, -0.856,
];

/** CSS saturate(1.25) matrix (row-major). */
export const SATURATE_125: readonly number[] = [
  1.197, -0.179, -0.018,
  -0.053, 1.071, -0.018,
  -0.053, -0.179, 1.232,
];

/** Row-major 3×3 matrix multiply. */
export function mat3mul(a: readonly number[], b: readonly number[]): number[] {
  const r = Array.from({ length: 9 }, () => 0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] =
        a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

/** The image counter-filter's combined matrix `M` for `out = bias - M·c`. */
const IMAGE_INVERT_MATRIX = mat3mul(SATURATE_125, HUE_ROTATE_180);
const IMAGE_INVERT_BIAS = 255;

/** The only filter string Excalidraw 0.18.1 assigns for the image counter-invert. */
const IMAGE_INVERT_FILTER = "invert(100%) hue-rotate(180deg) saturate(1.25)";

export function isImageInvertFilter(filter: string): boolean {
  const s = filter.trim();
  return s === IMAGE_INVERT_FILTER || s.startsWith(IMAGE_INVERT_FILTER);
}

/**
 * Apply `out = clamp(bias - M·[r,g,b])` to an RGBA buffer in place.
 * Alpha untouched. Pure — takes a plain array for testability.
 */
export function applyCounterInvert(
  data: Uint8ClampedArray | number[],
  start: number,
  end: number,
): void {
  const m = IMAGE_INVERT_MATRIX;
  for (let i = start; i < end; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    data[i] = clamp255(IMAGE_INVERT_BIAS - (m[0] * r + m[1] * g + m[2] * b));
    data[i + 1] = clamp255(IMAGE_INVERT_BIAS - (m[3] * r + m[4] * g + m[5] * b));
    data[i + 2] = clamp255(IMAGE_INVERT_BIAS - (m[6] * r + m[7] * g + m[8] * b));
  }
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// ---------------------------------------------------------------------------
// Runtime feature detection
// ---------------------------------------------------------------------------

/** Is the native canvas filter present but silently non-functional (WebKit)? */
export function isCanvasFilterBroken(): boolean {
  if (typeof document === "undefined") return false;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 1;
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  if (!("filter" in ctx)) return true;
  ctx.fillStyle = "rgb(64,128,192)";
  ctx.fillRect(0, 0, 4, 1);
  try {
    ctx.filter = "invert(100%)";
    ctx.fillStyle = "rgb(64,128,192)";
    ctx.fillRect(0, 0, 1, 1);
    ctx.filter = "none";
  } catch {
    return true;
  }
  // invert(100%) of rgb(64,128,192) → rgb(191,127,63). Unchanged pixel => broken.
  const px = ctx.getImageData(0, 0, 1, 1).data;
  return px[0] < 100;
}

// ---------------------------------------------------------------------------
// Shim state (per-context)
// ---------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

interface FilterState {
  /** The image counter-invert is the active ctx.filter. */
  active: boolean;
  /** Nesting depth of save() calls, so restore() clears only at depth zero. */
  saves: number;
}

const filterState = new WeakMap<Ctx, FilterState>();

function getFilterState(ctx: Ctx): FilterState {
  let s = filterState.get(ctx);
  if (!s) {
    s = { active: false, saves: 0 };
    filterState.set(ctx, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------

let installed = false;

/**
 * Patch ctx.filter to honor the image counter-invert by applying the pixel
 * transform after drawImage. Install once, app life; inert for every other
 * filter value. Guarded: webviews/tests without CanvasRenderingContext2D
 * (jsdom, SSR) never reach the prototype.
 */
export function installCanvasFilterShim(): void {
  if (installed) return;
  if (typeof CanvasRenderingContext2D === "undefined") return;
  installed = true;

  const Proto = CanvasRenderingContext2D.prototype;
  const native = {
    save: Proto.save,
    restore: Proto.restore,
    drawImage: Proto.drawImage,
  };

  try {
    Object.defineProperty(Proto, "filter", {
      configurable: true,
      enumerable: true,
      get(this: Ctx) {
        return getFilterState(this).active ? IMAGE_INVERT_FILTER : "none";
      },
      set(this: Ctx, value: string) {
        getFilterState(this).active = isImageInvertFilter(value);
      },
    });
  } catch {
    // Non-configurable native property — leave the shim's drawImage patch
    // active; it only needs the setter to flip `active`, which the patch
    // below can do only if the property is patchable. Rare; swallow.
  }

  Proto.save = function save(this: Ctx) {
    getFilterState(this).saves += 1;
    native.save.call(this);
  };

  Proto.restore = function restore(this: Ctx) {
    const s = getFilterState(this);
    if (s.saves > 0) s.saves -= 1;
    if (s.saves === 0) s.active = false;
    native.restore.call(this);
  };

  Proto.drawImage = function drawImage(
    this: Ctx,
    image: CanvasImageSource,
    ...args: number[]
  ) {
    const s = getFilterState(this);
    if (s.active) {
      const region = deviceDestRect(this, image, args);
      if (!region) {
        (native.drawImage as Function).apply(this, [image, ...args]);
        return;
      }
      (native.drawImage as Function).apply(this, [image, ...args]);
      const img = this.getImageData(region.x, region.y, region.w, region.h);
      applyCounterInvert(img.data, 0, img.data.length);
      this.putImageData(img, region.x, region.y);
      return;
    }
    (native.drawImage as Function).apply(this, [image, ...args]);
  } as typeof Proto.drawImage;
}

/**
 * Map drawImage's destination box through the current transform to device
 * pixel coordinates, clipped to the canvas. getImageData/putImageData ignore
 * the transform, so the pixels must be read in device space.
 */
function deviceDestRect(
  ctx: Ctx,
  image: CanvasImageSource,
  args: readonly number[],
): { x: number; y: number; w: number; h: number } | null {
  let dx: number;
  let dy: number;
  let dw: number;
  let dh: number;

  if (args.length === 8) {
    // sx, sy, sw, sh, dx, dy, dw, dh
    [dx, dy, dw, dh] = [args[4], args[5], args[6], args[7]];
  } else if (args.length === 4) {
    [dx, dy, dw, dh] = [args[0], args[1], args[2], args[3]];
  } else if (args.length === 2) {
    const el = image as { width?: number; height?: number };
    dx = args[0];
    dy = args[1];
    dw = el.width ?? 0;
    dh = el.height ?? 0;
  } else {
    return null;
  }

  const t = ctx.getTransform();
  const corners = [
    [dx, dy],
    [dx + dw, dy],
    [dx, dy + dh],
    [dx + dw, dy + dh],
  ].map(([px, py]) => [
    t.a * px + t.c * py + t.e,
    t.b * px + t.d * py + t.f,
  ]);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;

  if (w <= 0 || h <= 0) return null;

  const rx = Math.max(0, Math.round(x));
  const ry = Math.max(0, Math.round(y));
  const rw = Math.min(ctx.canvas.width - rx, Math.max(0, Math.round(w)));
  const rh = Math.min(ctx.canvas.height - ry, Math.max(0, Math.round(h)));
  if (rw <= 0 || rh <= 0) return null;
  return { x: rx, y: ry, w: rw, h: rh };
}

// ---------------------------------------------------------------------------
// Module init — runs once on first import of the drawing feature
// ---------------------------------------------------------------------------

if (typeof document !== "undefined" && isCanvasFilterBroken()) {
  installCanvasFilterShim();
}