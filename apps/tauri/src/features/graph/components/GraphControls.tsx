import type { FC } from "react";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
export type GraphColorMode = "single" | "tag" | "folder" | "cluster";

interface GraphControlsProps {
  query: string;
  onQueryChange: (value: string) => void;
  local: boolean;
  onToggleLocal: () => void;
  localDepth: number;
  onLocalDepthChange: (value: number) => void;
  onCenter: () => void;
  showOrphans: boolean;
  onToggleOrphans: () => void;
  showAttach: boolean;
  onToggleAttach: () => void;
  colorMode: GraphColorMode;
  onColorModeChange: (m: GraphColorMode) => void;
}

// Graph toolbar: filter bar (tag:/path:/ operators), local-graph toggle +
// depth, center-active, and the orphans/attachments display toggles. Pure
// presentational — all state lives in the GraphView leaf.
export const GraphControls: FC<GraphControlsProps> = ({
  query,
  onQueryChange,
  local,
  onToggleLocal,
  localDepth,
  onLocalDepthChange,
  onCenter,
  showOrphans,
  onToggleOrphans,
  showAttach,
  onToggleAttach,
  colorMode,
  onColorModeChange,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        right: 8,
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        alignItems: "center",
        zIndex: 10,
      }}
    >
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Filter: tag:foo  path:docs  name  (space = AND)"
        style={{ flex: "1 1 240px", minWidth: 180 }}
      />
      <Button variant="outline" size="sm" onClick={onToggleLocal}>
        {local ? "Local: on" : "Local: off"}
      </Button>
      {local && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            color: "var(--sat-text-primary, #e6edf3)",
            fontSize: 12,
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
      <Button variant="outline" size="sm" onClick={onCenter}>
        Center
      </Button>
      <Button variant="outline" size="sm" onClick={onToggleOrphans}>
        {showOrphans ? "Orphans ✓" : "Orphans"}
      </Button>
      <Button variant="outline" size="sm" onClick={onToggleAttach}>
        {showAttach ? "Attach ✓" : "Attach"}
      </Button>
      <select
        value={colorMode}
        onChange={(e) => onColorModeChange(e.target.value as GraphColorMode)}
        style={{
          background: "var(--sat-surface-2, #21262d)",
          color: "var(--sat-text-primary, #e6edf3)",
          border: "1px solid var(--sat-layout-border, #30363d)",
          borderRadius: 6,
          fontSize: 12,
          padding: "2px 6px",
        }}
      >
        <option value="single">Color: single</option>
        <option value="tag">Color: tag</option>
        <option value="folder">Color: folder</option>
        <option value="cluster">Color: cluster</option>
      </select>
    </div>
  );
};
