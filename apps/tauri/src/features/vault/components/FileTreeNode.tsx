import type { FC } from "react";
import type { FlatTreeNode } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pixels of indentation per depth level. */
const INDENT_PX = 12;

/** Fixed row height — must match the virtualizer's `estimateSize`. */
export const TREE_ROW_HEIGHT = 28;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M4 2.5 L7.5 6 L4 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {isOpen ? (
        // Open folder
        <path
          d="M1.5 4.5A1 1 0 0 1 2.5 3.5H6L7.5 5.5H13.5A1 1 0 0 1 14.5 6.5V12.5A1 1 0 0 1 13.5 13.5H2.5A1 1 0 0 1 1.5 12.5V4.5Z"
          stroke="var(--sat-accent-primary)"
          strokeWidth="1.2"
          fill="var(--sat-surface-2)"
        />
      ) : (
        // Closed folder
        <path
          d="M1.5 4.5A1 1 0 0 1 2.5 3.5H6L7.5 5.5H13.5A1 1 0 0 1 14.5 6.5V12.5A1 1 0 0 1 13.5 13.5H2.5A1 1 0 0 1 1.5 12.5V4.5Z"
          stroke="var(--sat-text-muted)"
          strokeWidth="1.2"
          fill="none"
        />
      )}
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M9.5 1.5H3.5A1 1 0 0 0 2.5 2.5V13.5A1 1 0 0 0 3.5 14.5H12.5A1 1 0 0 0 13.5 13.5V5.5L9.5 1.5Z"
        stroke="var(--sat-text-muted)"
        strokeWidth="1.2"
        fill="none"
      />
      <path
        d="M9.5 1.5V5.5H13.5"
        stroke="var(--sat-text-muted)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FileTreeNodeProps {
  node: FlatTreeNode;
  isOpen: boolean;
  isSelected: boolean;
  onFileClick: (node: FlatTreeNode) => void;
  onFolderToggle: (relPath: string) => void;
  /** Passed from the virtualizer so the row sits at the correct scroll offset. */
  style: React.CSSProperties;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FileTreeNode: FC<FileTreeNodeProps> = ({
  node,
  isOpen,
  isSelected,
  onFileClick,
  onFolderToggle,
  style,
}) => {
  const isFolder = node.kind === "folder";
  const paddingLeft = node.depth * INDENT_PX + 6;

  const handleClick = () => {
    if (isFolder) {
      onFolderToggle(node.relPath);
    } else {
      onFileClick(node);
    }
  };

  return (
    <div
      style={{ ...style, height: TREE_ROW_HEIGHT }}
      className={`
        flex items-center w-full
        text-left text-sm
        cursor-pointer select-none
        transition-colors duration-75
        ${isSelected
          ? "bg-[var(--sat-accent-primary)] text-[var(--sat-text-inverse)]"
          : "text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] hover:text-[var(--sat-text-primary)]"
        }
      `}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={isFolder ? isOpen : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      tabIndex={0}
    >
      {/* Indentation */}
      <span style={{ width: paddingLeft, flexShrink: 0 }} />

      {/* Chevron — only for folders, takes fixed width so files align */}
      <span className="w-4 flex items-center justify-center shrink-0">
        {isFolder && (
          <ChevronRight
            className={`
              text-[var(--sat-text-muted)] transition-transform duration-150
              ${isOpen ? "rotate-90" : ""}
            `}
          />
        )}
      </span>

      {/* Icon */}
      <span className="mr-1.5 flex items-center shrink-0">
        {isFolder ? <FolderIcon isOpen={isOpen} /> : <FileIcon />}
      </span>

      {/* Label */}
      <span className="truncate leading-none">{node.name}</span>

      {/* Child count badge — shown only for folders with children */}
      {isFolder && node.childCount > 0 && (
        <span className="ml-auto mr-2 text-[10px] text-[var(--sat-text-muted)] tabular-nums shrink-0">
          {node.childCount}
        </span>
      )}
    </div>
  );
};
