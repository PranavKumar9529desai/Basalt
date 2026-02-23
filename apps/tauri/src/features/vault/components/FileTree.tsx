import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FlatTreeNode } from "../types";
import { FileTreeNode, TREE_ROW_HEIGHT } from "./FileTreeNode";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FileTreeProps {
  visibleNodes: FlatTreeNode[];
  openFolders: Set<string>;
  selectedPath: string | null;
  onFileClick: (node: FlatTreeNode) => void;
  onFolderToggle: (relPath: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * The vault sidebar file tree.
 *
 * Receives a pre-sorted, pre-annotated flat array from Rust (via
 * `useVaultTree`) and renders only the visible rows using TanStack Virtual.
 *
 * Responsibilities:
 *   - Virtualise the visible node list so the sidebar handles any vault size
 *   - Delegate all row rendering to `FileTreeNode`
 *   - Show an empty state when the vault has no notes
 *
 * This component owns NO state and does NO data transformation — that is
 * entirely Rust's and `useVaultTree`'s responsibility.
 */
export function FileTree({
  visibleNodes,
  openFolders,
  selectedPath,
  onFileClick,
  onFolderToggle,
}: FileTreeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: visibleNodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TREE_ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <div className="flex flex-col h-full bg-[var(--sat-surface-2)] border border-[var(--sat-layout-border)] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--sat-layout-border)] shrink-0">
        {/* Files icon */}
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="text-[var(--sat-text-muted)] shrink-0"
        >
          <rect
            x="2"
            y="1.5"
            width="9"
            height="11"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
          <rect
            x="5"
            y="4.5"
            width="9"
            height="11"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="var(--sat-surface-1)"
          />
        </svg>
        <span className="text-xs font-semibold text-[var(--sat-text-primary)] uppercase tracking-wide">
          Files
        </span>
        {visibleNodes.length > 0 && (
          <span className="ml-auto text-xs text-[var(--sat-text-muted)] tabular-nums">
            {visibleNodes.filter((n) => n.kind === "file").length}
          </span>
        )}
      </div>

      {/* Scrollable virtualised list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        role="tree"
        aria-label="Vault file tree"
      >
        {visibleNodes.length === 0 ? (
          <EmptyState />
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((vItem) => {
              const node = visibleNodes[vItem.index];
              return (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  isOpen={openFolders.has(node.relPath)}
                  isSelected={node.path === selectedPath}
                  onFileClick={onFileClick}
                  onFolderToggle={onFolderToggle}
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 px-4">
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
