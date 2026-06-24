import { IconFolder, IconSearch, IconSettings } from "@tabler/icons-react";
import { ActivityBar as ActivityBarUI } from "@workspace/ui/components/activity-bar";
import { useState } from "react";
import { useSettingsStore } from "../features/settings";

export function ActivityBar() {
  const [activeId, setActiveId] = useState<string>("explorer");
  const openSettings = useSettingsStore((s) => s.open);

  const topItems = [
    {
      id: "explorer",
      icon: <IconFolder size={20} stroke={1.5} />,
      label: "Explorer",
    },
    {
      id: "search",
      icon: <IconSearch size={20} stroke={1.5} />,
      label: "Search",
    },
  ];

  const bottomItems = [
    {
      id: "settings",
      icon: <IconSettings size={20} stroke={1.5} />,
      label: "Settings",
    },
  ];

  return (
    <ActivityBarUI
      topItems={topItems}
      bottomItems={bottomItems}
      activeId={activeId}
      onItemClick={(id) => {
        setActiveId(id);
        if (id === "settings") openSettings();
      }}
    />
  );
}
