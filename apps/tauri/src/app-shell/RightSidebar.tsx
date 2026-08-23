import { IconLayoutSidebarRightCollapse } from "@tabler/icons-react";
import { SidebarPanel } from "@workspace/ui/components/sidebar";
import { useFocusedPaneStore } from "../features/editor";
import { BacklinksSidebar } from "../features/vault";

interface RightSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenNote: (path: string) => void;
}

/**
 * Right-hand sidebar hosting the backlinks view of the focused note.
 * Mirrors Obsidian's right sidebar — collapses independently of the left one.
 */
export function RightSidebar({
  open,
  onOpenChange,
  onOpenNote,
}: RightSidebarProps) {
  const backlinks = useFocusedPaneStore((s) => s.focusedPaneBacklinks);

  return (
    <SidebarPanel
      defaultWidth={272}
      minWidth={200}
      collapsed={!open}
      side="right"
      className="col-start-4 row-span-full border-l border-[var(--sat-layout-border)]"
    >
      {/* No border-b / hairline here — the shell's StripSeparator owns the
          continuous line under the whole header band. */}
      <div className="flex h-10 shrink-0 items-center px-2">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="ml-auto p-1 rounded text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] transition-colors"
        >
          <IconLayoutSidebarRightCollapse size={16} stroke={1.5} />
        </button>
      </div>
      <BacklinksSidebar
        backlinks={backlinks}
        onOpenNote={({ path }) => onOpenNote(path)}
      />
    </SidebarPanel>
  );
}