import {
  IconCode,
  IconCopy,
  IconChevronLeft,
  IconChevronRight,
  IconDotsVertical,
  IconLink,
  IconPencil,
  IconPin,
  IconX,
} from "@tabler/icons-react";
import { commandService } from "@workspace/commands";
import { Button } from "@workspace/ui/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@workspace/ui/components/ui/context-menu";
import type { LeafTabInfo } from "@workspace/views";
import { useRef, useState } from "react";
import { useRenameSignalStore } from "../features/editor/ui/renameSignal";
import { useTabsStore } from "../features/tabs";

/**
 * Per-leaf chrome row above the leaf content — the ⋮ overflow menu every
 * workbench pane gets (Obsidian's tab header actions). Generic by design:
 * it reads no leaf internals, only the structural tab record, so it works
 * for markdown, graph, and any future leaf type.
 *
 * Actions are leaf-agnostic except "Rename note", which only makes sense
 * for notes (markdown leaves) and is gated by `canRename`. Rename is
 * forwarded to the inline-title rename signal (the same F2 flow), never
 * opened here.
 *
 * This chrome is separate from the editor scroll container, so its
 * re-renders and clicks never touch the typing hot path.
 */
export function ViewHeader({
  tab,
  vaultPath,
  canRename,
}: {
  tab: LeafTabInfo;
  vaultPath: string | null;
  canRename: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Pin state read reactively so the label flips without a shell-wide
  // re-render (pin toggles are rare; this selector is the only subscription).
  const isPinned = useTabsStore((s) => s.tabs[tab.id]?.isPinned ?? false);
  const viewMode = useTabsStore((s) => s.tabs[tab.id]?.viewMode ?? "edit");

  const displayTitle = (() => {
    if (tab.path === "view://graph") return "Graph view";
    const relative =
      vaultPath && tab.path.startsWith(`${vaultPath}/`)
        ? tab.path.slice(vaultPath.length + 1)
        : tab.path;
    const parts = relative.replace(/\.md$/i, "").split("/").filter(Boolean);
    return parts.length >= 2
      ? `${parts[parts.length - 2]} / ${parts[parts.length - 1]}`
      : parts[0] ?? "";
  })();
  const relativePath =
    vaultPath && tab.path.startsWith(`${vaultPath}/`)
      ? tab.path.slice(vaultPath.length + 1)
      : tab.path;

  const close = () => setOpen(false);

  const copyText = (text: string) => {
    void navigator.clipboard?.writeText(text);
    close();
  };

  const handleBackClick = () => {
    // TODO: wire workspace navigation history back.
  };

  const handleForwardClick = () => {
    // TODO: wire workspace navigation history forward.
  };

  const handleModeClick = () => {
    console.log("[ReadingMode] header toggle clicked", {
      tabId: tab.id,
      currentMode: viewMode,
    });
    commandService.execute("editor:toggle-view-mode");
  };

  return (
    <div className="relative flex h-9 shrink-0 items-center gap-2 bg-[var(--sat-surface-1)] px-2">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Back"
          title="TODO: wire workspace back navigation"
          onClick={handleBackClick}
          className="text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]"
        >
          <IconChevronLeft size={14} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Forward"
          title="TODO: wire workspace forward navigation"
          onClick={handleForwardClick}
          className="text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]"
        >
          <IconChevronRight size={14} />
        </Button>
      </div>

      <div className="pointer-events-none absolute left-1/2 flex max-w-[42vw] -translate-x-1/2 items-center justify-center">
        <span className="truncate text-sm font-medium text-[var(--sat-text-primary)]">
          {displayTitle}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={viewMode === "reading" ? "Edit note" : "Reading view"}
          title={viewMode === "reading" ? "Edit note (Ctrl/Cmd+E)" : "Reading view (Ctrl/Cmd+E)"}
          onClick={handleModeClick}
          className="gap-1.5 px-2 text-xs text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]"
        >
          {viewMode === "reading" ? <IconPencil size={14} /> : <IconCode size={14} />}
          <span>{viewMode === "reading" ? "Reading" : "Editing"}</span>
        </Button>

        <ContextMenu open={open} onOpenChange={setOpen}>
          <button
            ref={buttonRef}
            type="button"
            aria-label="View actions"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--sat-text-muted)] outline-none hover:bg-[var(--sat-surface-3)] hover:text-[var(--sat-text-primary)] focus-visible:bg-[var(--sat-surface-3)]"
          >
            <IconDotsVertical size={14} />
          </button>
          {open && (
            <ContextMenuContent
              anchor={buttonRef.current ?? undefined}
              side="bottom"
              align="end"
              className="p-1"
            >
              {canRename && (
                <ContextMenuItem
                  onClick={() => {
                    useRenameSignalStore.getState().request(tab.id);
                    close();
                  }}
                >
                  <span className="inline-flex min-w-4 items-center justify-center">
                    <IconPencil size={14} />
                  </span>
                  Rename note
                </ContextMenuItem>
              )}

              <ContextMenuItem
                onClick={() => {
                  useTabsStore.getState().togglePinTab(tab.id);
                  close();
                }}
              >
                <span className="inline-flex min-w-4 items-center justify-center">
                  <IconPin size={14} />
                </span>
                {isPinned ? "Unpin" : "Pin tab"}
              </ContextMenuItem>

              {canRename && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => copyText(tab.path)}>
                    <span className="inline-flex min-w-4 items-center justify-center">
                      <IconCopy size={14} />
                    </span>
                    Copy path
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() =>
                      copyText(`[${displayTitle}](${relativePath})`)
                    }
                  >
                    <span className="inline-flex min-w-4 items-center justify-center">
                      <IconLink size={14} />
                    </span>
                    Copy link
                  </ContextMenuItem>
                </>
              )}

              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() => {
                  useTabsStore.getState().closeTab(tab.id, { force: false });
                  close();
                }}
              >
                <span className="inline-flex min-w-4 items-center justify-center">
                  <IconX size={14} />
                </span>
                Close tab
              </ContextMenuItem>
            </ContextMenuContent>
          )}
        </ContextMenu>
      </div>
    </div>
  );
}
