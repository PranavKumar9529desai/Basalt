import { IconCheck, IconChevronDown, IconX } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/ui/button";
import { Checkbox } from "@workspace/ui/components/ui/checkbox";
import { Dialog, DialogContent } from "@workspace/ui/components/ui/dialog";
import { Select } from "@workspace/ui/components/ui/select";
import { Slider } from "@workspace/ui/components/ui/slider";
import { useCallback, useState } from "react";
import { useExportStore } from "../store";
import type { PageSize, PageOrientation } from "../types";
import { renderAndPrint } from "../lib/pdf";
import type { PreviewDeps } from "../../search/types";

interface ExportDialogProps {
  previewDeps: PreviewDeps;
}

interface SmartCheckboxProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  available: boolean;
}

function SmartCheckbox({
  id,
  label,
  checked,
  onChange,
  available,
}: SmartCheckboxProps) {
  if (!available) return null;
  return (
    <div className="flex items-center gap-2">
      <Checkbox.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="h-4 w-4"
      />
      <label htmlFor={id} className="text-xs text-[var(--sat-text-secondary)]">
        {label}
      </label>
    </div>
  );
}

const PAGE_SIZES: { label: string; value: PageSize }[] = [
  { label: "A4", value: "A4" },
  { label: "Letter", value: "Letter" },
  { label: "Legal", value: "Legal" },
];
const ORIENTATIONS: { label: string; value: PageOrientation }[] = [
  { label: "Portrait", value: "portrait" },
  { label: "Landscape", value: "landscape" },
];

export function ExportDialog({ previewDeps }: ExportDialogProps) {
  const {
    isOpen,
    noteContent,
    noteName,
    close,
    setOptions,
    options,
    contentFeatures,
  } = useExportStore();
  const [isExporting, setIsExporting] = useState(false);

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

  return (
    <Dialog
      open={isOpen && !!noteContent}
      onOpenChange={(open: boolean) => {
        if (!open) close();
      }}
    >
      <DialogContent
        overlayClassName="bg-black/50"
        showCloseButton={false}
        aria-label="Export as PDF"
        className="flex w-full max-h-[80vh] flex-col overflow-hidden rounded-xl bg-[var(--sat-surface-1)] p-0 shadow-2xl sm:max-w-[480px]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sat-layout-border)]">
          <h2 className="text-sm font-semibold text-[var(--sat-text-primary)]">
            Export as PDF
          </h2>
          <Button
            variant="sat-ghost"
            size="icon-sm"
            onClick={close}
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
              <span className="text-xs font-medium text-[var(--sat-text-secondary)]">
                Page Size
              </span>
              <Select.Root
                value={options.pageSize}
                onValueChange={(v) => {
                  if (v !== null) setOptions({ pageSize: v as PageSize });
                }}
                items={PAGE_SIZES}
              >
                <Select.Trigger className="w-full">
                  <Select.Value />
                  <Select.Icon>
                    <IconChevronDown size={12} />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Positioner sideOffset={4} align="start">
                    <Select.Popup className="z-[60] min-w-[140px]">
                      <Select.List>
                        {PAGE_SIZES.map((size) => (
                          <Select.Item key={size.value} value={size.value}>
                            <Select.ItemText>{size.label}</Select.ItemText>
                            <Select.ItemIndicator>
                              <IconCheck size={12} className="flex-shrink-0" />
                            </Select.ItemIndicator>
                          </Select.Item>
                        ))}
                      </Select.List>
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </Select.Root>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-[var(--sat-text-secondary)]">
                Orientation
              </span>
              <Select.Root
                value={options.orientation}
                onValueChange={(v) => {
                  if (v !== null)
                    setOptions({ orientation: v as PageOrientation });
                }}
                items={ORIENTATIONS}
              >
                <Select.Trigger className="w-full">
                  <Select.Value />
                  <Select.Icon>
                    <IconChevronDown size={12} />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Positioner sideOffset={4} align="start">
                    <Select.Popup className="z-[60] min-w-[140px]">
                      <Select.List>
                        {ORIENTATIONS.map((o) => (
                          <Select.Item key={o.value} value={o.value}>
                            <Select.ItemText>{o.label}</Select.ItemText>
                            <Select.ItemIndicator>
                              <IconCheck size={12} className="flex-shrink-0" />
                            </Select.ItemIndicator>
                          </Select.Item>
                        ))}
                      </Select.List>
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </Select.Root>
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
              <Slider.Root
                id="export-font-size"
                value={options.fontSize}
                onValueChange={(v) => setOptions({ fontSize: v })}
                min={10}
                max={20}
                step={1}
                className="flex-1"
              >
                <Slider.Control>
                  <Slider.Track>
                    <Slider.Indicator />
                  </Slider.Track>
                  <Slider.Thumb />
                </Slider.Control>
              </Slider.Root>
              <span className="text-xs tabular-nums text-[var(--sat-text-muted)] w-8 text-right">
                {options.fontSize}px
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-[var(--sat-text-secondary)]">
              Include
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <SmartCheckbox
                id="include-theme"
                label="App color theme"
                checked={options.includeTheme}
                onChange={(v) => setOptions({ includeTheme: v })}
                available
              />
              <SmartCheckbox
                id="include-properties"
                label="Frontmatter properties"
                checked={options.includeProperties}
                onChange={(v) => setOptions({ includeProperties: v })}
                available={contentFeatures.hasFrontmatter}
              />
              <SmartCheckbox
                id="include-images"
                label="Images"
                checked={options.includeImages}
                onChange={(v) => setOptions({ includeImages: v })}
                available={contentFeatures.hasImages}
              />
              <SmartCheckbox
                id="include-tables"
                label="Tables"
                checked={options.includeTables}
                onChange={(v) => setOptions({ includeTables: v })}
                available={contentFeatures.hasTables}
              />
              <SmartCheckbox
                id="include-code-blocks"
                label="Code blocks"
                checked={options.includeCodeBlocks}
                onChange={(v) => setOptions({ includeCodeBlocks: v })}
                available={contentFeatures.hasCodeBlocks}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--sat-layout-border)]">
          <Button variant="sat-ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="sat-primary"
            size="sm"
            onClick={handleExport}
            disabled={isExporting || !noteContent}
          >
            {isExporting ? "Exporting…" : "Export"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}