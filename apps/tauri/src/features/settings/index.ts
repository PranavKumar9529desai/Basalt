import "./commands";
import "./registrations";

export { AppearanceEffects } from "./appearance-effects";
export { SettingsModal } from "./components/SettingsModal";
export { settingsRegistry, useEnabledSections, useSections } from "./registry";
export { useSettingsModalStore } from "./store";
export {
  getSetting,
  initSettings,
  setSetting,
  useSetting,
  useSettingsStore,
} from "./settings-data";
export type { TabClickOpenBehavior } from "./settings-data";
export type {
  SettingButtonSpec,
  SettingControlType,
  SettingItemSpec,
  SettingOption,
  SettingSearchEntry,
  SettingSectionDef,
  SettingsGroup,
} from "./types";