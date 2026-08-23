import { useVirtualizer } from "@tanstack/react-virtual";
import { ScrollArea } from "@workspace/ui/components/ui/scroll-area";
import { cn } from "@workspace/ui/lib/utils";
import { useRef } from "react";
import { FileTreeNode, TREE_ROW_HEIGHT } from "./FileTreeNode";
import type { FileTreeProps } from "./types";

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 h-full">
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="text-[var(--sat-text-muted)]"
      >
        <path
          d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
      <p className="text-xs text-[var(--sat-text-muted)] text-center leading-relaxed">
        No markdown files found.
        <br />
        Create a <code className="text-[var(--sat-text-muted)]">.md</code> file
        in your vault folder.
      </p>
    </div>
  );
}

export function FileTree({
  nodes,
  selectedIds,
  onSelect,
  onToggleExpand,
  onContextMenu,
  onBackgroundContextMenu,
  onCommitEdit,
  onCancelEdit,
  className,
}: FileTreeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TREE_ROW_HEIGHT,
    overscan: 8,
    // Breathing room above the first row and below the last (scrolls with
    // the list — plain CSS padding would break virtualizer measurements).
    paddingStart: 8,
    paddingEnd: 8,
  });

  return (
    <ScrollArea
      viewportRef={scrollRef}
      className={cn("flex-1 h-full", className)}
      onContextMenu={(e) => {
        if (!onBackgroundContextMenu) return;
        const target = e.target as HTMLElement;
        if (target.closest("[role='treeitem']")) return;
        e.preventDefault();
        onBackgroundContextMenu(e);
      }}
    >
      {nodes.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          role="tree"
          aria-label="File tree"
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((vItem) => {
            const node = nodes[vItem.index];
            return (
              <FileTreeNode
                key={node.id}
                node={node}
                isOpen={node.isOpen ?? false}
                isSelected={selectedIds ? selectedIds.has(node.id) : false}
                onFileClick={onSelect}
                onFolderToggle={onToggleExpand}
                onContextMenu={onContextMenu}
                onCommitEdit={onCommitEdit}
                onCancelEdit={onCancelEdit}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vItem.start}px)`,
                }}
              />
            );
          })}
        </div>
      )}
    </ScrollArea>
  );
}
