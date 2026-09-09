import { SettingItem } from "../layout/SettingItem";

/**
 * CommunityPluginsSection — third-party plugin manager (ADR-037 §7 /
 * spec §5.6). The plugin host (ADR-018 Phase 5) is not built yet, so
 * the roster is empty; the sidebar already shows the matching empty
 * state. Community plugins that expose settings will register sections
 * through `settingsRegistry` and appear here automatically.
 */
export default function CommunityPluginsSection() {
  return (
    <SettingItem
      name="Community plugins"
      description={
        <span>
          Third-party plugins will be installed from here once the plugin host
          ships. No community plugins are installed yet.
        </span>
      }
    >
      <span className="text-xs text-[var(--sat-text-muted)]">0 installed</span>
    </SettingItem>
  );
}
