import {
  IconArrowsExchange,
  IconCalendar,
  IconCheckbox,
  IconClipboardList,
  IconGraph,
  IconHistory,
  IconLayoutGrid,
  IconLink,
  IconSettings,
  IconTerminal2,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { Button } from "@workspace/ui/components/ui/button";
import { useEnabledSections } from "../../lib/registry";
import { setSetting, useSetting } from "../../lib/settings-data";
import { useSettingsModalStore } from "../../store";
import { SettingToggle } from "../controls";
import { SettingItem } from "../layout/SettingItem";

export interface CorePluginMeta {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}

/** First-party core plugin roster shown by the manager (spec §5.6). */
export const CORE_PLUGINS: CorePluginMeta[] = [
  {
    id: "backlinks",
    name: "Backlinks",
    description: "Backlinks dock view and note backlinks.",
    icon: IconLink,
  },
  {
    id: "canvas",
    name: "Canvas",
    description: "Infinite spatial note board.",
    icon: IconLayoutGrid,
  },
  {
    id: "command-palette",
    name: "Command palette",
    description: "Quick command launcher.",
    icon: IconTerminal2,
  },
  {
    id: "dailies",
    name: "Daily notes",
    description: "Daily journal note creation.",
    icon: IconCalendar,
  },
  {
    id: "file-recovery",
    name: "File recovery",
    description: "Local snapshot history.",
    icon: IconHistory,
  },
  {
    id: "graph",
    name: "Graph view",
    description: "Interactive force-directed graph.",
    icon: IconGraph,
  },
  {
    id: "quick-switcher",
    name: "Quick switcher",
    description: "Fuzzy file search.",
    icon: IconArrowsExchange,
  },
  {
    id: "templates",
    name: "Templates",
    description: "Insertable note boilerplate.",
    icon: IconClipboardList,
  },
  {
    id: "tasks",
    name: "Tasks",
    description: "Native task management.",
    icon: IconCheckbox,
  },
];

/**
 * CorePluginsSection — the plugin manager tab (ADR-037 §7.F / spec §5.6).
 *
 * One row per core plugin: icon + name + description on the left; a
 * gear button (when the plugin has a registered settings tab, jumps
 * straight to it) and a master enable toggle on the right. The toggle
 * persists to `enabledPlugins` and gates the plugin's settings tab via
 * the registry's `isEnabled` predicate — disabling a plugin removes
 * its tab from the sidebar instantly.
 */
export function CorePluginsSection() {
  const enabled = useSetting("enabledPlugins");
  const sections = useEnabledSections();
  const setActiveSection = useSettingsModalStore((s) => s.setActiveSection);

  return (
    <div>
      {CORE_PLUGINS.map((plugin) => {
        const Icon = plugin.icon;
        const section = sections.find((s) => s.pluginId === plugin.id);
        const checked = enabled[plugin.id] !== false;
        return (
          <SettingItem
            key={plugin.id}
            name={plugin.name}
            description={
              <span className="flex items-center gap-1.5">
                <Icon size={13} className="flex-shrink-0" />
                {plugin.description}
              </span>
            }
          >
            {section && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setActiveSection(section.id)}
                aria-label={`Open ${plugin.name} settings`}
                title="Settings"
                className="text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]"
              >
                <IconSettings size={14} />
              </Button>
            )}
            <SettingToggle
              checked={checked}
              onCheckedChange={(next) =>
                setSetting("enabledPlugins", { ...enabled, [plugin.id]: next })
              }
            />
          </SettingItem>
        );
      })}
    </div>
  );
}
