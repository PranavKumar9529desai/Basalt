import { IconLink, IconSearch, IconSettings } from "@tabler/icons-react";
import { ActivityBar as ActivityBarUI } from "@workspace/ui/components/activity-bar";
import { useSearchStore } from "../features/search";
import { useSettingsStore } from "../features/settings";

interface ActivityBarProps {
  rightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
}

/**
 * The ribbon — the far-left vertical bar of the workspace. Mirrors Obsidian's
 * ribbon: quick-access actions that stay visible even when the sidebars are
 * collapsed (Backlinks toggles right, Search opens, Settings opens).
 *
 * The file-tree toggle lives in the TopStrip (FileTreeToggle), not here.
 */
export function ActivityBar({
  rightSidebarOpen,
  onToggleRightSidebar,
}: ActivityBarProps) {
  const openSearch = useSearchStore((s) => s.openSearch);
  const openSettings = useSettingsStore((s) => s.open);

  const topItems = [
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
    <ActivityBarUI
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
