import { cn } from "@workspace/ui/lib/utils";
import { type FC, useCallback, useEffect, useRef } from "react";
import type { FileNode } from "./types";

/** Pixels of indentation per depth level. */
const INDENT_PX = 16;

/** Fixed row height — must match the virtualizer's estimateSize. */
export const TREE_ROW_HEIGHT = 24;

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

function FolderIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M1.5 4.5A1 1 0 0 1 2.5 3.5H6L7.5 5.5H13.5A1 1 0 0 1 14.5 6.5V12.5A1 1 0 0 1 13.5 13.5H2.5A1 1 0 0 1 1.5 12.5V4.5Z"
        stroke="var(--sat-text-muted)"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect
        x="2"
        y="1"
        width="10"
        height="12"
        rx="1.5"
        stroke="var(--sat-text-muted)"
        strokeWidth="1.0"
      />
      <line x1="4.5" y1="5" x2="9.5" y2="5" stroke="var(--sat-text-muted)" strokeWidth="0.75" strokeLinecap="round" />
      <line x1="4.5" y1="7.5" x2="9.5" y2="7.5" stroke="var(--sat-text-muted)" strokeWidth="0.75" strokeLinecap="round" />
      <line x1="4.5" y1="10" x2="7.5" y2="10" stroke="var(--sat-text-muted)" strokeWidth="0.75" strokeLinecap="round" />
    </svg>
  );
}

interface InlineEditInputProps {
  node: FileNode;
  onCommitEdit?: (node: FileNode, newName: string) => void;
  onCancelEdit?: (node: FileNode) => void;
}

function InlineEditInput({
  node,
  onCommitEdit,
  onCancelEdit,
}: InlineEditInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    // Auto-focus and select all text when the input mounts
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const commit = useCallback(
    (value: string) => {
      if (committedRef.current) return; // prevent double-fire
      committedRef.current = true;
      const trimmed = value.trim();
      if (trimmed && onCommitEdit) {
        onCommitEdit(node, trimmed);
      } else if (onCancelEdit) {
        onCancelEdit(node);
      }
    },
    [node, onCommitEdit, onCancelEdit],
  );

  const cancel = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (onCancelEdit) onCancelEdit(node);
  }, [node, onCancelEdit]);

  return (
    <input
      ref={inputRef}
      className="flex-1 min-w-0 h-[18px] px-1 text-[13px] leading-none bg-transparent border border-[var(--sat-accent-primary)] rounded-sm text-[var(--sat-text-primary)] outline-none placeholder:text-[var(--sat-text-muted)]"
      defaultValue={node.name}
      placeholder={node.isFolder ? "Folder name" : "Note title"}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(e.currentTarget.value);
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
        // Stop propagation so tree keyboard nav doesn't interfere
        e.stopPropagation();
      }}
      onBlur={(e) => {
        commit(e.currentTarget.value);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

interface FileTreeNodeProps {
  node: FileNode;
  isOpen: boolean;
  isSelected: boolean;
  onFileClick: (node: FileNode, e: React.UIEvent) => void;
  onFolderToggle: (node: FileNode, e: React.UIEvent) => void;
  onContextMenu?: (node: FileNode, e: React.MouseEvent) => void;
  onCommitEdit?: (node: FileNode, newName: string) => void;
  onCancelEdit?: (node: FileNode) => void;
  /** Passed from the virtualizer so the row sits at the correct scroll offset. */
  style: React.CSSProperties;
}

export const FileTreeNode: FC<FileTreeNodeProps> = ({
  node,
  isOpen,
  isSelected,
  onFileClick,
  onFolderToggle,
  onContextMenu,
  onCommitEdit,
  onCancelEdit,
  style,
}) => {
  const isFolder = node.isFolder;
  const isEditing = node.isEditing ?? false;
  const paddingLeft = node.depth * INDENT_PX + 6;

  const displayName = !node.isFolder && node.name.endsWith('.md')
    ? node.name.slice(0, -3)
    : node.name;

  const handleClick = (e: React.UIEvent) => {
    if (isEditing) return; // Don't navigate while editing
    e.stopPropagation();
    if (isFolder) {
      onFolderToggle(node, e);
    } else {
      onFileClick(node, e);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isEditing) return;
    if (onContextMenu) {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(node, e);
    }
  };

  return (
    <div
      style={{ ...style, height: TREE_ROW_HEIGHT }}
      className={cn(
        "pr-2 border-l-2",
        isSelected
          ? "pl-[6px] border-[var(--sat-accent-primary)]"
          : "pl-2 border-transparent",
      )}
    ><div
      className={cn(
        "group flex items-center w-full h-full text-left text-[13px] cursor-pointer select-none outline-none font-normal",
        // Avoid transform transitions causing subpixel antialiasing weirdness on Webkit:
        "transform-gpu transition-colors duration-75",
        "rounded-md",
        isEditing
          ? "bg-[var(--sat-surface-2)]"
          : isSelected
            ? "bg-[color-mix(in_srgb,var(--sat-accent-primary)_10%,transparent)] text-[var(--sat-text-primary)]"
            : "text-[var(--sat-text-muted)] hover:bg-[var(--sat-surface-3)] hover:text-[var(--sat-text-primary)]",
        node.isCut ? "opacity-60" : "",
      )}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={isFolder ? isOpen : undefined}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
        if (isEditing) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick(e);
        }
      }}
      tabIndex={isEditing ? -1 : 0}
    >
      {/* Indentation guide lines */}
      <div
        className="relative flex h-full shrink-0"
        style={{ width: paddingLeft }}
      >
        {Array.from({ length: node.depth }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-[var(--sat-layout-border)] opacity-30"
            style={{ left: `${(i * INDENT_PX) + 4 + INDENT_PX / 2}px` }}
          />
        ))}
      </div>

      {/* Chevron — only for folders, takes fixed width so files align */}
      <span className="w-4 flex items-center justify-center shrink-0">
        {isFolder && (
          <ChevronRight
            className={cn(
              "text-[var(--sat-text-muted)] transition-transform duration-150",
              isOpen ? "rotate-90" : "",
            )}
          />
        )}
      </span>

      {/* Icon */}
      <span className="mr-1.5 flex items-center shrink-0">
        {isFolder ? <FolderIcon /> : <FileIcon />}
      </span>

      {/* Label or inline edit input */}
      {isEditing ? (
        <InlineEditInput
          node={node}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
        />
      ) : (
        <span
          className={cn(
            "truncate leading-none antialiased",
            isSelected ? "font-medium" : "font-normal",
          )}
        >
          {displayName}
        </span>
      )}
    </div></div>
  );
};
