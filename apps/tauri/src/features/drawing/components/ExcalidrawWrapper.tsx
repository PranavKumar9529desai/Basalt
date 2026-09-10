import { memo } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  ExcalidrawAppStateStub,
  ExcalidrawElementStub,
  ExcalidrawSceneData,
} from "../types";
import { useExcalidrawTheme } from "../hooks/useExcalidrawTheme";

export interface ExcalidrawWrapperProps {
  initialData: Partial<ExcalidrawSceneData> | null;
  onChange: (
    elements: readonly ExcalidrawElementStub[],
    appState: Partial<ExcalidrawAppStateStub>,
    files?: Record<string, unknown>,
  ) => void;
  onApiReady?: (api: any) => void;
}

export const ExcalidrawWrapper = memo(function ExcalidrawWrapper({
  initialData,
  onChange,
  onApiReady,
}: ExcalidrawWrapperProps) {
  const { theme, cssOverride } = useExcalidrawTheme();

  // The canvas background is whatever sat-surface-1 resolves to.
  // We read it directly via the CSS var so it matches cssOverride.
  const canvasBg =
    typeof document !== "undefined"
      ? window.getComputedStyle(document.documentElement)
          .getPropertyValue("--sat-surface-1")
          .trim() || (theme === "light" ? "#f8fafc" : "#0d0e12")
      : theme === "light"
        ? "#f8fafc"
        : "#0d0e12";

  return (
    // excalidraw-basalt-host is the scope selector for the CSS override block
    // injected by useExcalidrawTheme — it maps Basalt's --sat-* tokens onto
    // Excalidraw's own CSS variable namespace.
    <div className="excalidraw-basalt-host relative w-full h-full overflow-hidden">
      {/* Inject scoped CSS that maps sat-* tokens → Excalidraw vars */}
      <style>{cssOverride}</style>
      <Excalidraw
        excalidrawAPI={onApiReady}
        initialData={
          initialData
            ? {
                elements: initialData.elements as any,
                appState: {
                  ...initialData.appState,
                  theme,
                  viewBackgroundColor:
                    initialData.appState?.viewBackgroundColor || canvasBg,
                } as any,
                files: initialData.files as any,
              }
            : null
        }
        theme={theme}
        onChange={(elements, appState, files) => {
          onChange(
            elements as unknown as readonly ExcalidrawElementStub[],
            appState as unknown as Partial<ExcalidrawAppStateStub>,
            files,
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

