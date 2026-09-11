import { memo, useCallback, useRef } from "react";
import type { LeafProps } from "@workspace/views";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useDrawingState } from "../hooks/useDrawingState";
import { ExcalidrawWrapper } from "./ExcalidrawWrapper";
import { DrawingHeaderActions } from "./DrawingHeaderActions";
import { downloadBlob, exportSceneToBlob, exportSceneToSvg } from "../lib/export";
import { stemOf } from "@workspace/ui";

export const DrawingView = memo(function DrawingView({ tab }: LeafProps) {
  const {
    isLoaded,
    viewMode,
    initialData,
    rawMarkdown,
    sceneDataRef,
    onSceneChange,
    setRawMarkdown,
    toggleViewMode,
  } = useDrawingState({ tab });

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  const handleApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  const handleExportSvg = useCallback(async () => {
    try {
      const svg = await exportSceneToSvg(
        sceneDataRef.current.elements,
        sceneDataRef.current.appState,
        sceneDataRef.current.files,
        { background: "theme" },
      );
      const svgString = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const filename = `${stemOf(tab.path) || "drawing"}.svg`;
      downloadBlob(blob, filename);
    } catch (err) {
      console.error("Failed to export SVG:", err);
    }
  }, [tab.path, sceneDataRef]);

  const handleExportPng = useCallback(async () => {
    try {
      const blob = await exportSceneToBlob(
        sceneDataRef.current.elements,
        sceneDataRef.current.appState,
        sceneDataRef.current.files,
        { background: "theme" },
      );
      const filename = `${stemOf(tab.path) || "drawing"}.png`;
      downloadBlob(blob, filename);
    } catch (err) {
      console.error("Failed to export PNG:", err);
    }
  }, [tab.path, sceneDataRef]);

  const handleZoomToFit = useCallback(() => {
    if (apiRef.current && typeof apiRef.current.scrollToContent === "function") {
      apiRef.current.scrollToContent(undefined, { fitToViewport: true });
    }
  }, []);

  if (!isLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[var(--sat-text-muted,#71717a)] text-xs">
        Loading drawing…
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 h-full w-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--sat-surface-1,#121110)]">
      <DrawingHeaderActions
        viewMode={viewMode}
        onToggleViewMode={toggleViewMode}
        onExportSvg={handleExportSvg}
        onExportPng={handleExportPng}
        onZoomToFit={handleZoomToFit}
      />

      {viewMode === "canvas" ? (
        <ExcalidrawWrapper
          initialData={initialData}
          onChange={onSceneChange}
          onApiReady={handleApiReady}
        />
      ) : (
        <div className="relative flex-1 w-full h-full p-4 overflow-auto">
          <textarea
            aria-label="Raw Markdown editor"
            className="w-full h-full min-h-[400px] p-4 font-mono text-sm leading-relaxed rounded-lg border border-[var(--sat-layout-border,#27272a)] bg-[var(--sat-surface-2,#18181b)] text-[var(--sat-text-default,#fafafa)] resize-none outline-none focus:ring-1 focus:ring-[var(--sat-accent-primary,#f97316)]"
            value={rawMarkdown}
            onChange={(e) => setRawMarkdown(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
});
