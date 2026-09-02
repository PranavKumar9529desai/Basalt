import type { FC } from "react";
import { Switch } from "@base-ui/react/switch";
import { Select } from "@base-ui/react/select";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
export type GraphColorMode = "single" | "tag" | "folder" | "cluster";

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
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "var(--sat-text-primary)",
      }}
    >
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        style={{
          display: "inline-flex",
          alignItems: checked ? "center" : "flex-start",
          justifyContent: "flex-start",
          width: 30,
          height: 18,
          padding: 2,
          border: "1px solid var(--sat-layout-border)",
          borderRadius: "var(--sat-layout-radius-pill)",
          background: checked
            ? "var(--sat-accent-primary)"
            : "var(--sat-surface-1)",
          cursor: "pointer",
        }}
      >
        <Switch.Thumb
          style={{
            width: 12,
            height: 12,
            borderRadius: "var(--sat-radius-pill)",
            background: checked
              ? "var(--sat-text-inverse)"
              : "var(--sat-text-muted)",
            transform: checked ? "translateX(12px)" : "translateX(0)",
            transition: "transform 120ms ease",
          }}
        />
      </Switch.Root>
      <span>{label}</span>
    </label>
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
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 260,
        maxWidth: "calc(100% - 24px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 10,
        padding: 12,
        border: "1px solid var(--sat-layout-border)",
        borderRadius: "var(--sat-layout-radius-md)",
        background: "var(--sat-surface-2)",
        boxShadow: "var(--sat-layout-shadow-md)",
        fontFamily: "var(--sat-font-sans)",
        fontSize: "calc(var(--sat-editor-font-size) * 0.875)",
        lineHeight: "var(--sat-editor-line-height)",
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <strong
          style={{
            color: "var(--sat-text-primary)",
            fontSize: "calc(var(--sat-editor-font-size) * 0.875)",
            fontWeight: "var(--sat-editor-section-label-weight)",
          }}
        >
          Graph settings
        </strong>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Hide graph settings"
          onClick={onClose}
        >
          x
        </Button>
      </div>
      <div
        style={{
          color: "var(--sat-editor-section-label-color)",
          fontSize: "calc(var(--sat-editor-font-size) * 0.875)",
          fontWeight: "var(--sat-editor-section-label-weight)",
        }}
      >
        Filter
      </div>
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Filter: tag:foo  path:docs  name  (space = AND)"
        style={{ width: "100%" }}
      />
      <div
        style={{
          color: "var(--sat-editor-section-label-color)",
          fontSize: "calc(var(--sat-editor-font-size) * 0.875)",
          fontWeight: "var(--sat-editor-section-label-weight)",
        }}
      >
        Scope
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
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
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            color: "var(--sat-text-primary)",
            fontSize: "calc(var(--sat-editor-font-size) * 0.875)",
          }}
        >
          Depth
          <input
            type="range"
            min={1}
            max={5}
            value={localDepth}
            onChange={(e) => onLocalDepthChange(Number(e.target.value))}
          />
          {localDepth}
        </label>
      )}
      <div
        style={{
          color: "var(--sat-editor-section-label-color)",
          fontSize: "calc(var(--sat-editor-font-size) * 0.875)",
          fontWeight: "var(--sat-editor-section-label-weight)",
        }}
      >
        Display
      </div>
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
      >
        <Select.Trigger
          aria-label="Graph color mode"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            minWidth: 132,
            height: 30,
            padding: "0 8px",
            border: "1px solid var(--sat-layout-border)",
            borderRadius: "var(--sat-layout-radius-sm)",
            background: "var(--sat-surface-2)",
            color: "var(--sat-text-primary)",
            fontSize: "calc(var(--sat-editor-font-size) * 0.875)",
            cursor: "pointer",
          }}
        >
          <Select.Value>
            {colorMode === "single"
              ? "Color: single"
              : colorMode === "tag"
                ? "Color: tag"
                : colorMode === "folder"
                  ? "Color: folder"
                  : "Color: cluster"}
          </Select.Value>
          <Select.Icon style={{ color: "var(--sat-text-muted)" }}>
            v
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={4} style={{ zIndex: 50 }}>
            <Select.Popup
              style={{
                minWidth: 132,
                padding: 4,
                border: "1px solid var(--sat-layout-border)",
                borderRadius: "var(--sat-layout-radius-sm)",
                background: "var(--sat-surface-2)",
                color: "var(--sat-text-primary)",
                boxShadow: "var(--sat-layout-shadow-md)",
              }}
            >
              {(
                [
                  ["single", "Color: single"],
                  ["tag", "Color: tag"],
                  ["folder", "Color: folder"],
                  ["cluster", "Color: cluster"],
                ] as const
              ).map(([value, label]) => (
                <Select.Item
                  key={value}
                  value={value}
                  className="data-[highlighted]:bg-[var(--sat-accent-primary)] data-[highlighted]:text-[var(--sat-text-inverse)]"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    minHeight: 28,
                    padding: "0 8px",
                    borderRadius: "var(--sat-layout-radius-sm)",
                    color: "var(--sat-text-primary)",
                    fontSize: "calc(var(--sat-editor-font-size) * 0.875)",
                    cursor: "pointer",
                  }}
                >
                  <Select.ItemText>{label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
};
