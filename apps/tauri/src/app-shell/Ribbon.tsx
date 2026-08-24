import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLink,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react";
import { Ribbon as RibbonUI } from "@workspace/ui/components/ribbon";
import { useSearchStore } from "../features/search";
import { useSettingsModalStore } from "../features/settings";

interface RibbonProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  rightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
}

/**
 * The ribbon — the far-left vertical bar of the workspace. Mirrors Obsidian's
 * ribbon: quick-access actions that stay visible even when the sidebars are
 * collapsed (Backlinks toggles right, Search opens, Settings opens).
 *
 * The file-tree toggle is the first (topmost) item here, taking the
 * top-left corner position of the workspace.
 */
export function Ribbon({
  sidebarOpen,
  onToggleSidebar,
  rightSidebarOpen,
  onToggleRightSidebar,
}: RibbonProps) {
  const openSearch = useSearchStore((s) => s.openSearch);
  const openSettings = useSettingsModalStore((s) => s.open);

  const SidebarToggleIcon = sidebarOpen
    ? IconLayoutSidebarLeftCollapse
    : IconLayoutSidebarLeftExpand;

  const topItems = [
    {
      id: "file-tree",
      icon: <SidebarToggleIcon size={20} stroke={1.5} />,
      label: sidebarOpen ? "Collapse file tree" : "Expand file tree",
      onClick: onToggleSidebar,
    },
    {
      id: "backlinks",
      icon: <IconLink size={20} stroke={1.5} />,
      label: "Backlinks",
      onClick: onToggleRightSidebar,
    },
    {
      id: "search",
      icon: <IconSearch size={20} stroke={1.5} />,
      label: "Search",
      onClick: openSearch,
    },
  ];

  const bottomItems = [
    {
      id: "settings",
      icon: <IconSettings size={20} stroke={1.5} />,
      label: "Settings",
      onClick: openSettings,
    },
  ];

  const activeId = rightSidebarOpen ? "backlinks" : null;

  return (
    <RibbonUI
      topItems={topItems}
      bottomItems={bottomItems}
      activeId={activeId}
      onItemClick={(id) => {
        const item = [...topItems, ...bottomItems].find((i) => i.id === id);
        item?.onClick();
      }}
    />
  );
}
