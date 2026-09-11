import { memo } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  ExcalidrawAppStateStub,
  ExcalidrawElementStub,
  ExcalidrawSceneData,
} from "../types";
import { resolveCanvasBg } from "../lib/scene";

export interface ExcalidrawWrapperProps {
  initialData: Partial<ExcalidrawSceneData> | null;
  onChange: (
    elements: readonly ExcalidrawElementStub[],
    appState: Partial<ExcalidrawAppStateStub>,
    files?: Record<string, unknown>,
  ) => void;
  onApiReady?: (api: ExcalidrawImperativeAPI) => void;
}

/** Detect light/dark from the document's data-theme attribute. */
function detectTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  const t = document.documentElement.dataset.theme ?? "";
  if (["light", "latte", "solarized-light"].some((l) => t.includes(l)))
    return "light";
  if (t) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export const ExcalidrawWrapper = memo(function ExcalidrawWrapper({
  initialData,
  onChange,
  onApiReady,
}: ExcalidrawWrapperProps) {
  const theme = detectTheme();

  return (
    <div className="relative w-full h-full overflow-hidden">
      <Excalidraw
        excalidrawAPI={onApiReady}
        initialData={
          initialData
            ? {
                elements: initialData.elements as unknown as readonly ExcalidrawElement[],
                appState: {
                  ...initialData.appState,
                  theme,
                  viewBackgroundColor: resolveCanvasBg(
                    initialData.appState?.viewBackgroundColor,
                  ),
                } as unknown as Partial<AppState>,
                files: initialData.files as unknown as BinaryFiles,
              }
            : null
        }
        theme={theme}
        onChange={(elements, appState, files) => {
          onChange(
            elements as unknown as readonly ExcalidrawElementStub[],
            appState as unknown as Partial<ExcalidrawAppStateStub>,
            files as unknown as Record<string, unknown>,
          );
        }}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
          welcomeScreen: false,
        }}
      />
    </div>
  );
});
