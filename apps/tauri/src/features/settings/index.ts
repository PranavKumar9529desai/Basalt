import "./lib/commands";
import "./lib/registrations";

export { AppearanceEffects } from "./lib/appearance-effects";
export { SettingsModal } from "./components/SettingsModal";
export {
  settingsRegistry,
  useEnabledSections,
  useSections,
} from "./lib/registry";
export { useSettingsModalStore } from "./store";
export {
  getSetting,
  initSettings,
  setSetting,
  useSetting,
  useSettingsStore,
} from "./lib/settings-data";
export type { TabClickOpenBehavior } from "./lib/settings-data";
export type {
  SettingButtonSpec,
  SettingControlType,
  SettingItemSpec,
  SettingOption,
  SettingSearchEntry,
  SettingSectionDef,
  SettingsGroup,
} from "./types";
