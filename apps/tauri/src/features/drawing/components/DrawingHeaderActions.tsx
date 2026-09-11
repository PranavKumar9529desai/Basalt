import { memo, useState } from "react";
import {
  IconCode,
  IconDownload,
  IconMaximize,
  IconPalette,
  IconPhoto,
  IconSettings,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/ui/button";
import type { DrawingViewMode } from "../types";

export interface DrawingHeaderActionsProps {
  viewMode: DrawingViewMode;
  onToggleViewMode: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onZoomToFit?: () => void;
}

const ICON_BTN =
  "h-7 w-7 p-0 flex items-center justify-center rounded-md text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)]";

/**
 * Drawing pane settings strip — floats at the top-right of the pane, above
 * the Excalidraw surface, as a compact vertical button. The expanded panel
 * opens to the left of the strip so it never covers the canvas area directly
 * under the button.
 */
export const DrawingHeaderActions = memo(function DrawingHeaderActions({
  viewMode,
  onToggleViewMode,
  onExportSvg,
  onExportPng,
  onZoomToFit,
}: DrawingHeaderActionsProps) {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div
      className="absolute top-[72px] right-3 z-30 flex flex-col items-center gap-1 rounded-lg border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)]/90 backdrop-blur-md p-1 shadow-sm"
      aria-label="Drawing actions"
    >
      <Button
        variant="ghost"
        size="icon"
        className={ICON_BTN}
        onClick={() => setPanelOpen((v) => !v)}
        title="Drawing settings"
        aria-expanded={panelOpen}
      >
        {panelOpen ? <IconX size={15} /> : <IconSettings size={15} />}
      </Button>

      {/* Dropdown panel — anchored left of the floating strip */}
      {panelOpen && (
        <div
          className="absolute top-[72px] right-14 z-30 flex flex-col gap-1 rounded-lg border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)]/95 backdrop-blur-md p-2 shadow-md min-w-[160px]"
          aria-label="Drawing action panel"
        >
          <p className="text-[10px] uppercase tracking-wide text-[var(--sat-text-muted)] px-1 pb-0.5 font-medium">
            Drawing
          </p>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-start gap-2 text-xs text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] px-2"
            onClick={() => { onToggleViewMode(); setPanelOpen(false); }}
            title={
              viewMode === "canvas"
                ? "Switch to Raw Markdown mode"
                : "Switch to Visual Canvas mode"
            }
          >
            {viewMode === "canvas" ? (
              <><IconCode size={13} /><span>Raw Markdown</span></>
            ) : (
              <><IconPalette size={13} /><span>Canvas</span></>
            )}
          </Button>

          {viewMode === "canvas" && onZoomToFit && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-2 text-xs text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] px-2"
              onClick={() => { onZoomToFit(); setPanelOpen(false); }}
              title="Zoom to fit"
            >
              <IconMaximize size={13} /><span>Zoom to fit</span>
            </Button>
          )}

          {viewMode === "canvas" && (
            <>
              <div className="h-px bg-[var(--sat-layout-border)] my-0.5" />
              <p className="text-[10px] uppercase tracking-wide text-[var(--sat-text-muted)] px-1 pb-0.5 font-medium">
                Export
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-start gap-2 text-xs text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] px-2"
                onClick={() => { onExportSvg(); setPanelOpen(false); }}
                title="Export as SVG"
              >
                <IconDownload size={13} /><span>SVG</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-start gap-2 text-xs text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] px-2"
                onClick={() => { onExportPng(); setPanelOpen(false); }}
                title="Export as PNG"
              >
                <IconPhoto size={13} /><span>PNG</span>
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
});