import {
  IconCalendarEvent,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLink,
  IconTag,
  IconSearch,
  IconSettings,
  IconSitemap,
  IconTemplate,
} from "@tabler/icons-react";
import { commandService } from "@workspace/commands";
import { BasaltMark } from "@workspace/ui/components/brand";
import { Ribbon as RibbonUI } from "@workspace/ui/components/ribbon";
import { useSearchStore } from "../features/search";
import { useSettingsModalStore } from "../features/settings";
import { useTabsStore } from "../features/tabs";

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
  const openGraph = useTabsStore((s) => s.openView);

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
      id: "tags",
      icon: <IconTag size={20} stroke={1.5} />,
      label: "Tags",
      onClick: onToggleRightSidebar,
    },
    {
      id: "search",
      icon: <IconSearch size={20} stroke={1.5} />,
      label: "Search",
      onClick: openSearch,
    },
    {
      id: "graph",
      icon: <IconSitemap size={20} stroke={1.5} />,
      label: "Open graph view",
      onClick: () => openGraph("graph", { title: "Graph" }),
    },
    {
      id: "templates",
      icon: <IconTemplate size={20} stroke={1.5} />,
      label: "Insert template",
      onClick: () => commandService.execute("templates:insert"),
    },
    {
      id: "dailies",
      icon: <IconCalendarEvent size={20} stroke={1.5} />,
      label: "Open today's daily note",
      onClick: () => commandService.execute("dailies:open-today"),
    },
  ];

  const bottomItems = [
    {
      id: "brand",
      icon: <BasaltMark size="xs" className="w-5 h-5 opacity-80 hover:opacity-100 transition-opacity" />,
      label: "Basalt",
      onClick: openSettings,
    },
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
