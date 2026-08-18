import {
  IconArrowsSort,
  IconChevronUp,
  IconFilePlus,
  IconFolderPlus,
  IconLayoutSidebarLeftCollapse,
} from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import {
  type SidebarAction,
  SidebarHeader,
  SidebarPanel,
} from "@workspace/ui/components/sidebar";
import { type ReactNode, useCallback, useRef } from "react";

interface SidebarProps {
  children: ReactNode;
  defaultWidth?: number;
  collapsed?: boolean;
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onCollapse?: () => void;
}

export function Sidebar({
  children,
  defaultWidth,
  collapsed,
  onCreateNote,
  onCreateFolder,
  onCollapse,
}: SidebarProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWidthChange = useCallback((width: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      invoke("set_workspace_key", { key: "sidebarWidth", value: width });
    }, 400);
  }, []);

  const actions: SidebarAction[] = [
    {
      id: "new-note",
      icon: <IconFilePlus size={16} stroke={1.5} />,
      label: "New note",
      onClick: onCreateNote,
    },
    {
      id: "new-folder",
      icon: <IconFolderPlus size={16} stroke={1.5} />,
      label: "New folder",
      onClick: onCreateFolder,
    },
    {
      id: "sort",
      icon: <IconArrowsSort size={16} stroke={1.5} />,
      label: "Sort",
      onClick: () => console.log("Sort toggled"),
    },
    {
      id: "collapse-all",
      icon: <IconChevronUp size={16} stroke={1.5} />,
      label: "Collapse all",
      onClick: () => console.log("Collapse all clicked"),
    },
  ];

  return (
    <SidebarPanel
      defaultWidth={defaultWidth}
      onWidthChange={handleWidthChange}
      collapsed={collapsed}
    >
      <SidebarHeader
        actions={actions}
        trailing={
          onCollapse ? (
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="p-1 rounded text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] transition-colors"
            >
              <IconLayoutSidebarLeftCollapse size={16} stroke={1.5} />
            </button>
          ) : undefined
        }
      />
      {children}
    </SidebarPanel>
  );
}
