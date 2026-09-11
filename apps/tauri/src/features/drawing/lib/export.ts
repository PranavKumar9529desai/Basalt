import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, NonDeleted } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawElementStub, ExcalidrawAppStateStub } from "../types";
import { resolveCanvasBg } from "./scene";

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
 * Exports scene elements and state to an SVG element via Excalidraw's export engine.
 * Dynamically imports `@excalidraw/excalidraw` so non-drawing views never pay the bundle cost.
 */
export async function exportSceneToSvg(
  elements: readonly ExcalidrawElementStub[],
  appState?: Partial<ExcalidrawAppStateStub>,
  files?: Record<string, unknown>,
): Promise<SVGSVGElement> {
  const { exportToSvg } = await import("@excalidraw/excalidraw");
  return exportToSvg({
    elements: elements as unknown as readonly NonDeleted<ExcalidrawElement>[],
    appState: {
      ...appState,
      exportBackground: true,
      viewBackgroundColor: resolveCanvasBg(appState?.viewBackgroundColor),
    } as unknown as Partial<Omit<AppState, "offsetTop" | "offsetLeft">>,
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
): Promise<Blob> {
  const { exportToBlob } = await import("@excalidraw/excalidraw");
  return exportToBlob({
    elements: elements as unknown as readonly NonDeleted<ExcalidrawElement>[],
    appState: {
      ...appState,
      exportBackground: true,
      viewBackgroundColor: resolveCanvasBg(appState?.viewBackgroundColor),
    } as unknown as Partial<Omit<AppState, "offsetTop" | "offsetLeft">>,
    files: (files || {}) as unknown as BinaryFiles,
    mimeType: "image/png",
  });
}