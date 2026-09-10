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
  const { theme, viewBackgroundColor } = useExcalidrawTheme();

  return (
    <div className="relative w-full h-full overflow-hidden bg-[var(--sat-surface-1,#121110)]">
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
                    initialData.appState?.viewBackgroundColor || viewBackgroundColor,
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
