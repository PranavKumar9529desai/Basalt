import type { FC } from "react";
import { IconChevronDown, IconX } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Select } from "@workspace/ui/components/ui/select";
import { Slider } from "@workspace/ui/components/ui/slider";
import { Switch } from "@workspace/ui/components/ui/switch";
export type GraphColorMode = "single" | "tag" | "folder" | "cluster";

const COLOR_MODES: { label: string; value: GraphColorMode }[] = [
  { label: "Color: single", value: "single" },
  { label: "Color: tag", value: "tag" },
  { label: "Color: folder", value: "folder" },
  { label: "Color: cluster", value: "cluster" },
];

function ToggleRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[var(--sat-text-primary)]">
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="h-[18px] w-[30px]"
      >
        <Switch.Thumb className="size-3 translate-x-[3px] bg-[var(--sat-text-muted)] transition-transform data-[checked]:translate-x-[15px] data-[checked]:bg-[var(--sat-text-inverse)]" />
      </Switch.Root>
      <span>{label}</span>
    </label>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[calc(var(--sat-editor-font-size)*0.875)] font-[var(--sat-editor-section-label-weight)] text-[var(--sat-editor-section-label-color)]">
      {children}
    </div>
  );
}

interface GraphControlsProps {
  query: string;
  onQueryChange: (value: string) => void;
  local: boolean;
  onToggleLocal: () => void;
  localDepth: number;
  onLocalDepthChange: (value: number) => void;
  onCenter: () => void;
  onFit: () => void;
  showOrphans: boolean;
  onToggleOrphans: () => void;
  showAttach: boolean;
  onToggleAttach: () => void;
  colorMode: GraphColorMode;
  onColorModeChange: (m: GraphColorMode) => void;
  onClose: () => void;
}

// Graph settings inspector: filter, scope, centering, display toggles, and
// color grouping. Pure presentational — all state lives in the Graph leaf.
export const GraphControls: FC<GraphControlsProps> = ({
  query,
  onQueryChange,
  local,
  onToggleLocal,
  localDepth,
  onLocalDepthChange,
  onCenter,
  onFit,
  showOrphans,
  onToggleOrphans,
  showAttach,
  onToggleAttach,
  colorMode,
  onColorModeChange,
  onClose,
}) => {
  return (
    <div className="absolute top-3 right-3 z-10 flex w-[260px] max-w-[calc(100%-24px)] flex-col items-stretch gap-2.5 border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] p-3 text-[calc(var(--sat-editor-font-size)*0.875)] leading-[var(--sat-editor-line-height)] shadow-[var(--sat-layout-shadow-md)]">
      <div className="flex items-center justify-between">
        <strong className="text-[calc(var(--sat-editor-font-size)*0.875)] font-[var(--sat-editor-section-label-weight)] text-[var(--sat-text-primary)]">
          Graph settings
        </strong>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Hide graph settings"
          onClick={onClose}
        >
          <IconX size={14} />
        </Button>
      </div>
      <SectionLabel>Filter</SectionLabel>
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Filter: tag:foo  path:docs  name  (space = AND)"
        className="w-full"
      />
      <SectionLabel>Scope</SectionLabel>
      <div className="flex items-center gap-1.5">
        <ToggleRow
          checked={local}
          label="Local graph"
          onChange={onToggleLocal}
        />
        <Button variant="outline" size="sm" onClick={onCenter}>
          Center
        </Button>
        <Button variant="outline" size="sm" onClick={onFit}>
          Fit graph
        </Button>
      </div>
      {local && (
        <label className="flex items-center gap-1 text-[var(--sat-text-primary)]">
          Depth
          <Slider.Root
            value={localDepth}
            onValueChange={onLocalDepthChange}
            min={1}
            max={5}
            className="w-24"
          >
            <Slider.Control>
              <Slider.Track>
                <Slider.Indicator />
              </Slider.Track>
              <Slider.Thumb />
            </Slider.Control>
          </Slider.Root>
          {localDepth}
        </label>
      )}
      <SectionLabel>Display</SectionLabel>
      <ToggleRow
        checked={showOrphans}
        label="Show orphans"
        onChange={onToggleOrphans}
      />
      <ToggleRow
        checked={showAttach}
        label="Show attachments"
        onChange={onToggleAttach}
      />
      <Select.Root
        value={colorMode}
        onValueChange={(value) => onColorModeChange(value as GraphColorMode)}
        items={COLOR_MODES}
      >
        <Select.Trigger aria-label="Graph color mode" className="min-w-[132px]">
          <Select.Value />
          <Select.Icon>
            <IconChevronDown size={12} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={4} className="z-50">
            <Select.Popup>
              <Select.List>
                {COLOR_MODES.map((mode) => (
                  <Select.Item key={mode.value} value={mode.value}>
                    <Select.ItemText>{mode.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
};