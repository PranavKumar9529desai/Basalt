import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  NonDeleted,
} from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawElementStub, ExcalidrawAppStateStub } from "../types";
import { CANVAS_BG, darkModePreInvert, getSurfaceColor } from "./scene";

/**
 * How the exported image should treat its background.
 * - "none":  fully transparent — the host surface (note / editor) shows through.
 *            Used for in-note embeds so drawings melt into the note.
 * - "theme": solid background baked from the live `--sat-surface-1` token,
 *            pre-inverted when the drawing is dark so Excalidraw's dark-mode
 *            filter recovers the exact theme colour. Used for downloads.
 */
export type ExportBackground = "none" | "theme";

export interface ExportSceneOptions {
  background?: ExportBackground;
}

function exportAppState(
  appState: Partial<ExcalidrawAppStateStub> | undefined,
  background: ExportBackground,
): Partial<Omit<AppState, "offsetTop" | "offsetLeft">> {
  const exportWithDarkMode = appState?.theme === "dark";
  // ExcalidrawAppStateStub's loose shapes (e.g. zoom) don't satisfy the
  // branded AppState types; the original code cast similarly.
  return {
    ...appState,
    exportBackground: background === "theme",
    exportWithDarkMode,
    theme: appState?.theme,
    viewBackgroundColor:
      background === "theme"
        ? exportWithDarkMode
          ? darkModePreInvert(getSurfaceColor())
          : getSurfaceColor()
        : CANVAS_BG,
  } as unknown as Partial<Omit<AppState, "offsetTop" | "offsetLeft">>;
}

/**
 * Triggers a browser download for a given Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports scene elements and state to an SVG element via Excalidraw's export
 * engine. Dynamically imports `@excalidraw/excalidraw` so non-drawing views
 * never pay the bundle cost.
 */
export async function exportSceneToSvg(
  elements: readonly ExcalidrawElementStub[],
  appState?: Partial<ExcalidrawAppStateStub>,
  files?: Record<string, unknown>,
  opts: ExportSceneOptions = {},
): Promise<SVGSVGElement> {
  const { exportToSvg } = await import("@excalidraw/excalidraw");
  return exportToSvg({
    elements: elements as unknown as readonly NonDeleted<ExcalidrawElement>[],
    appState: exportAppState(appState, opts.background ?? "none"),
    files: (files || {}) as unknown as BinaryFiles,
  });
}

/**
 * Exports scene elements and state to a PNG Blob via Excalidraw's export engine.
 */
export async function exportSceneToBlob(
  elements: readonly ExcalidrawElementStub[],
  appState?: Partial<ExcalidrawAppStateStub>,
  files?: Record<string, unknown>,
  opts: ExportSceneOptions = {},
): Promise<Blob> {
  const { exportToBlob } = await import("@excalidraw/excalidraw");
  return exportToBlob({
    elements: elements as unknown as readonly NonDeleted<ExcalidrawElement>[],
    appState: exportAppState(appState, opts.background ?? "none"),
    files: (files || {}) as unknown as BinaryFiles,
    mimeType: "image/png",
  });
}
