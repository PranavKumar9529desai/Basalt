import {
  IconFileText,
  IconFolder,
  IconKeyboard,
  IconPalette,
  IconPuzzle,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import CommunityPluginsSection from "./components/sections/CommunityPluginsSection";
import CorePluginsSection, {
  CORE_PLUGINS,
} from "./components/sections/CorePluginsSection";
import HotkeysSection from "./components/sections/HotkeysSection";
import { settingsRegistry } from "./registry";
import { getSetting } from "./settings-data";
import {
  APPEARANCE_SPECS,
  DAILIES_SPECS,
  EDITOR_SPECS,
  FILES_LINKS_SPECS,
  GENERAL_SPECS,
  TEMPLATES_SPECS,
} from "./specs";

/**
 * Boot-time settings section registrations (ADR-037 §1 / spec §7.2).
 *
 * Imported once by `index.ts` for its side effects — the same
 * `settingsRegistry.register(...)` path third-party plugins use.
 * Options are the built-in preference pages; core-plugin sections are
 * gated by the Core plugins manager's enabled state (a plugin disabled
 * there disappears from the sidebar instantly).
 */

/** Plugin-gated visibility: absent from `enabledPlugins` = enabled. */
const pluginEnabled = (id: string) => () => getSetting("enabledPlugins")[id] !== false;

// ─── Options — built-in preference pages ─────────────────────────────────
settingsRegistry.register({
  id: "general",
  label: "General",
  group: "options",
  icon: IconSettings,
  order: 0,
  description: "App version, updates, language, and help.",
  specs: GENERAL_SPECS,
});

settingsRegistry.register({
  id: "appearance",
  label: "Appearance",
  group: "options",
  icon: IconPalette,
  order: 1,
  description: "Colors, typography, and interface scaling.",
  specs: APPEARANCE_SPECS,
});

settingsRegistry.register({
  id: "editor",
  label: "Editor",
  group: "options",
  icon: IconFileText,
  order: 2,
  description: "Editing behavior and default view mode.",
  specs: EDITOR_SPECS,
});

settingsRegistry.register({
  id: "files-links",
  label: "Files and links",
  group: "options",
  icon: IconFolder,
  order: 3,
  description: "Where new notes and attachments live, and how links are written.",
  specs: FILES_LINKS_SPECS,
});

settingsRegistry.register({
  id: "hotkeys",
  label: "Hotkeys",
  group: "options",
  icon: IconKeyboard,
  order: 4,
  description: "Customize the keyboard shortcut for any command.",
  component: HotkeysSection,
});

settingsRegistry.register({
  id: "core-plugins",
  label: "Core plugins",
  group: "options",
  icon: IconPuzzle,
  order: 5,
  description: "Enable and configure built-in plugins.",
  component: CorePluginsSection,
});

settingsRegistry.register({
  id: "community-plugins",
  label: "Community plugins",
  group: "options",
  icon: IconUsers,
  order: 6,
  description: "Manage third-party plugins.",
  component: CommunityPluginsSection,
});

// ─── Core plugins — settings tabs for plugins with configurable options ──
// (ADR-036: core plugins are self-contained first parties; only plugins
// that declare specs get a tab here, matching Obsidian's "Core plugins"
// sidebar group that lists enabled plugins with settings pages.)
for (const plugin of CORE_PLUGINS) {
  const specs =
    plugin.id === "templates"
      ? TEMPLATES_SPECS
      : plugin.id === "dailies"
        ? DAILIES_SPECS
        : undefined;
  if (!specs) continue;
  settingsRegistry.register({
    id: plugin.id,
    label: plugin.name,
    group: "core-plugins",
    icon: plugin.icon,
    order: CORE_PLUGINS.indexOf(plugin),
    pluginId: plugin.id,
    isEnabled: pluginEnabled(plugin.id),
    description: plugin.description,
    specs,
  });
}