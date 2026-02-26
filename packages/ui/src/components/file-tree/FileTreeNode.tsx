import type { FC } from "react";
import type { FileNode } from "./types";
import { cn } from "@workspace/ui/lib/utils";

/** Pixels of indentation per depth level. */
const INDENT_PX = 16;

/** Fixed row height — must match the virtualizer's estimateSize. */
export const TREE_ROW_HEIGHT = 26;

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

// Clean bold folder icon
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
                <path
                    d="M1.5 4.5A1 1 0 0 1 2.5 3.5H6L7.5 5.5H13.5A1 1 0 0 1 14.5 6.5V12.5A1 1 0 0 1 13.5 13.5H2.5A1 1 0 0 1 1.5 12.5V4.5Z"
                    stroke="var(--sat-accent-primary)"
                    strokeWidth="1.2"
                    fill="var(--sat-surface-2)"
                />
            ) : (
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

interface FileTreeNodeProps {
    node: FileNode;
    isOpen: boolean;
    isSelected: boolean;
    onFileClick: (node: FileNode, e: React.UIEvent) => void;
    onFolderToggle: (node: FileNode, e: React.UIEvent) => void;
    onContextMenu?: (node: FileNode, e: React.MouseEvent) => void;
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
    style,
}) => {
    const isFolder = node.isFolder;
    const paddingLeft = node.depth * INDENT_PX + 6;

    const handleClick = (e: React.UIEvent) => {
        e.stopPropagation();
        if (isFolder) {
            onFolderToggle(node, e);
        } else {
            onFileClick(node, e);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        if (onContextMenu) {
            onContextMenu(node, e);
        }
    };

    return (
        <div
            style={{ ...style, height: TREE_ROW_HEIGHT }}
            className={cn(
                "group flex items-center w-full text-left text-[13px] cursor-pointer select-none outline-none font-normal",
                // Avoid transform transitions causing subpixel antialiasing weirdness on Webkit:
                "transform-gpu transition-colors duration-75",
                isSelected
                    ? "bg-[color-mix(in_srgb,var(--sat-accent-primary)_15%,transparent)] text-[var(--sat-text-primary)]"
                    : "text-[var(--sat-text-secondary)] hover:bg-[var(--sat-surface-3)] hover:text-[var(--sat-text-primary)]",
            )}
            role="treeitem"
            aria-selected={isSelected}
            aria-expanded={isFolder ? isOpen : undefined}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleClick(e);
                }
            }}
            tabIndex={0}
        >
            {/* Indentation guide lines */}
            <div
                className="relative flex h-full shrink-0"
                style={{ width: paddingLeft }}
            >
                {Array.from({ length: node.depth }).map((_, i) => (
                    <div
                        key={i}
                        className="absolute top-0 bottom-0 w-px bg-[var(--sat-layout-border)] opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ left: `${(i * INDENT_PX) + 4 + (INDENT_PX / 2)}px` }}
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
                {isFolder ? <FolderIcon isOpen={isOpen} /> : <FileIcon />}
            </span>

            {/* Label */}
            <span className={cn("truncate leading-none antialiased", isSelected ? "font-medium" : "font-normal")}>
                {node.name}
            </span>
        </div>
    );
};
