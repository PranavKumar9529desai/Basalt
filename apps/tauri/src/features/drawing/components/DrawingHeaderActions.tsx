import { memo } from "react";
import {
  IconCode,
  IconDownload,
  IconMaximize,
  IconPalette,
  IconPhoto,
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

export const DrawingHeaderActions = memo(function DrawingHeaderActions({
  viewMode,
  onToggleViewMode,
  onExportSvg,
  onExportPng,
  onZoomToFit,
}: DrawingHeaderActionsProps) {
  return (
    <div className="absolute top-3 right-4 z-20 flex items-center gap-1.5 rounded-lg border border-[var(--sat-layout-border,#27272a)] bg-[var(--sat-surface-2,#18181b)]/90 backdrop-blur-md px-2 py-1 shadow-sm">
      {viewMode === "canvas" && onZoomToFit && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-[var(--sat-text-muted,#a1a1aa)] hover:text-[var(--sat-text-default,#fafafa)]"
          onClick={onZoomToFit}
          title="Zoom to fit"
        >
          <IconMaximize size={14} className="mr-1" />
          Fit
        </Button>
      )}

      {viewMode === "canvas" && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-[var(--sat-text-muted,#a1a1aa)] hover:text-[var(--sat-text-default,#fafafa)]"
            onClick={onExportSvg}
            title="Export scene as SVG"
          >
            <IconDownload size={14} className="mr-1" />
            SVG
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-[var(--sat-text-muted,#a1a1aa)] hover:text-[var(--sat-text-default,#fafafa)]"
            onClick={onExportPng}
            title="Export scene as PNG"
          >
            <IconPhoto size={14} className="mr-1" />
            PNG
          </Button>
        </>
      )}

      <div className="h-4 w-[1px] bg-[var(--sat-layout-border,#27272a)] mx-0.5" />

      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-[var(--sat-text-muted,#a1a1aa)] hover:text-[var(--sat-text-default,#fafafa)]"
        onClick={onToggleViewMode}
        title={
          viewMode === "canvas"
            ? "Switch to Raw Markdown mode"
            : "Switch to Visual Canvas mode"
        }
      >
        {viewMode === "canvas" ? (
          <>
            <IconCode size={14} className="mr-1" />
            Raw Markdown
          </>
        ) : (
          <>
            <IconPalette size={14} className="mr-1" />
            Canvas
          </>
        )}
      </Button>
    </div>
  );
});
