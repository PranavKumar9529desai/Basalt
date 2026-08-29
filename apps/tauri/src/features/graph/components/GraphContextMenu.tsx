import type { FC } from "react";
import { Button } from "@workspace/ui/components/ui/button";

export interface GraphMenuTarget {
  x: number;
  y: number;
  full: number;
}

interface GraphContextMenuProps {
  menu: GraphMenuTarget | null;
  onOpen: (full: number) => void;
  onOpenInNewTab: (full: number) => void;
  onCenter: (full: number) => void;
  onOpenLocalGraph: (full: number) => void;
}

// Right-click node menu. Pure presentational — `GraphView` supplies the
// callbacks (which close over refs/services and clear the menu).
export const GraphContextMenu: FC<GraphContextMenuProps> = ({
  menu,
  onOpen,
  onOpenInNewTab,
  onCenter,
  onOpenLocalGraph,
}) => {
  if (!menu) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: menu.x + 2,
        top: menu.y + 2,
        zIndex: 20,
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 6,
        padding: 4,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 168,
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        className="justify-start w-full"
        onClick={() => onOpen(menu.full)}
      >
        Open
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="justify-start w-full"
        onClick={() => onOpenInNewTab(menu.full)}
      >
        Open in New Tab
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="justify-start w-full"
        onClick={() => onCenter(menu.full)}
      >
        Center in Graph
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="justify-start w-full"
        onClick={() => onOpenLocalGraph(menu.full)}
      >
        Open Local Graph
      </Button>
    </div>
  );
};
