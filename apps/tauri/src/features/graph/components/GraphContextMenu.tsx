import type { FC } from "react";
import { Button } from "@workspace/ui/components/ui/button";

export interface GraphMenuTarget {
  x: number;
  y: number;
  full: number;
}

interface GraphContextMenuProps {
  menu: GraphMenuTarget | null;
  isTag?: boolean;
  onOpen: (full: number) => void;
  onOpenInNewTab: (full: number) => void;
  onCenter: (full: number) => void;
  onOpenLocalGraph: (full: number) => void;
  onFilter: (full: number) => void;
  onExpand: (full: number) => void;
}

// Right-click node menu. Pure presentational — `Graph` supplies the
// callbacks (which close over refs/services and clear the menu).
export const GraphContextMenu: FC<GraphContextMenuProps> = ({
  menu,
  isTag,
  onOpen,
  onOpenInNewTab,
  onCenter,
  onOpenLocalGraph,
  onFilter,
  onExpand,
}) => {
  if (!menu) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: menu.x + 2,
        top: menu.y + 2,
        zIndex: 20,
        background: "var(--sat-surface-2)",
        border: "1px solid var(--sat-layout-border)",
        borderRadius: 6,
        padding: 4,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 168,
      }}
    >
      {isTag ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start w-full"
            onClick={() => onFilter(menu.full)}
          >
            Filter by tag
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start w-full"
            onClick={() => onCenter(menu.full)}
          >
            Center in Graph
          </Button>
        </>
      ) : (
        <>
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
          <Button
            variant="ghost"
            size="sm"
            className="justify-start w-full"
            onClick={() => onExpand(menu.full)}
          >
            Expand neighborhood
          </Button>
        </>
      )}
    </div>
  );
};
