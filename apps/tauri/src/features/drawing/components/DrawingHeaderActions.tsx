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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
} from "@workspace/ui/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip";
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
 * the Excalidraw surface, as a compact vertical button. The dropdown panel
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
    <DropdownMenu open={panelOpen} onOpenChange={setPanelOpen}>
      <div
        className="absolute top-[72px] right-3 z-30 flex flex-col items-center gap-1 rounded-lg border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)]/90 backdrop-blur-md p-1 shadow-sm"
        aria-label="Drawing actions"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className={ICON_BTN}
                onClick={() => setPanelOpen((v) => !v)}
                aria-label="Drawing settings"
                aria-expanded={panelOpen}
              >
                {panelOpen ? <IconX size={15} /> : <IconSettings size={15} />}
              </Button>
            }
          />
          <TooltipContent>Drawing settings</TooltipContent>
        </Tooltip>
      </div>

      <DropdownMenuPortal>
        <DropdownMenuContent
          side="left"
          align="start"
          sideOffset={0}
          className="min-w-[160px] p-2"
        >
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">
            Drawing
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={onToggleViewMode}>
            {viewMode === "canvas" ? (
              <>
                <IconCode size={13} />
                <span>Raw Markdown</span>
              </>
            ) : (
              <>
                <IconPalette size={13} />
                <span>Canvas</span>
              </>
            )}
          </DropdownMenuItem>

          {viewMode === "canvas" && onZoomToFit && (
            <DropdownMenuItem onClick={onZoomToFit}>
              <IconMaximize size={13} />
              <span>Zoom to fit</span>
            </DropdownMenuItem>
          )}

          {viewMode === "canvas" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">
                Export
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={onExportSvg}>
                <IconDownload size={13} />
                <span>SVG</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportPng}>
                <IconPhoto size={13} />
                <span>PNG</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
});
