import { IconX } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/ui/button";
import { useCallback, useRef, useState } from "react";
import { useExportStore } from "../store";
import type { PageSize, PageOrientation } from "../types";
import { renderAndPrint } from "../lib/pdf";
import type { PreviewDeps } from "../../search/types";

const selectClass =
  "h-8 rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] px-2 text-xs text-[var(--sat-text-primary)] outline-none focus:ring-1 focus:ring-[var(--sat-accent-primary)]";

interface ExportDialogProps {
  previewDeps: PreviewDeps;
}

export function ExportDialog({ previewDeps }: ExportDialogProps) {
  const { isOpen, noteContent, noteName, close, setOptions, options } =
    useExportStore();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        close();
      }
    },
    [close],
  );

  const handleExport = useCallback(async () => {
    if (!noteContent || !noteName) return;
    setIsExporting(true);
    try {
      await renderAndPrint(noteContent, noteName, options, previewDeps);
    } catch (err) {
      console.error("[export] PDF export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, [noteContent, noteName, options, previewDeps]);

  if (!isOpen || !noteContent) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={handleBackdropClick}
      />
      <div
        ref={dialogRef}
        // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- Custom modal chrome; native <dialog> would change stacking/styling
        role="dialog"
        aria-modal="true"
        aria-label="Export as PDF"
        className="relative flex flex-col w-[480px] max-h-[80vh] overflow-hidden rounded-xl bg-[var(--sat-surface-1)] shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sat-layout-border)]">
          <h2 className="text-sm font-semibold text-[var(--sat-text-primary)]">
            Export as PDF
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={close}
            className="text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]"
            aria-label="Close"
          >
            <IconX size={14} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-[var(--sat-text-secondary)]">
              Note
            </span>
            <p className="text-sm text-[var(--sat-text-primary)] truncate">
              {noteName}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="export-page-size"
                className="text-xs font-medium text-[var(--sat-text-secondary)]"
              >
                Page Size
              </label>
              <select
                id="export-page-size"
                value={options.pageSize}
                onChange={(e) =>
                  setOptions({ pageSize: e.target.value as PageSize })
                }
                className={selectClass}
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="export-orientation"
                className="text-xs font-medium text-[var(--sat-text-secondary)]"
              >
                Orientation
              </label>
              <select
                id="export-orientation"
                value={options.orientation}
                onChange={(e) =>
                  setOptions({
                    orientation: e.target.value as PageOrientation,
                  })
                }
                className={selectClass}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="export-font-size"
              className="text-xs font-medium text-[var(--sat-text-secondary)]"
            >
              Font Size
            </label>
            <div className="flex items-center gap-3">
              <input
                id="export-font-size"
                type="range"
                min={10}
                max={20}
                value={options.fontSize}
                onChange={(e) =>
                  setOptions({ fontSize: Number(e.target.value) })
                }
                className="flex-1 accent-[var(--sat-accent-primary)]"
              />
              <span className="text-xs tabular-nums text-[var(--sat-text-muted)] w-8 text-right">
                {options.fontSize}px
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="include-theme"
              checked={options.includeTheme}
              onChange={(e) => setOptions({ includeTheme: e.target.checked })}
              className="accent-[var(--sat-accent-primary)]"
            />
            <label
              htmlFor="include-theme"
              className="text-xs text-[var(--sat-text-secondary)]"
            >
              Include app color theme
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--sat-layout-border)]">
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={isExporting || !noteContent}
          >
            {isExporting ? "Exporting…" : "Export"}
          </Button>
        </div>
      </div>
    </div>
  );
}
