import { themes } from "@workspace/theme/manifest";
import type { SettingItemSpec, SettingOption } from "../types";

/**
 * Appearance options specs (ADR-037 §7.B / spec §5.2).
 *
 * Live application of accent/font/size/zoom happens in
 * `settings/appearance-effects.ts` (mounted in the shell) — these specs
 * only describe the controls.
 */
const themeOptions: SettingOption[] = themes.map((t) => ({
  label: t.label,
  value: t.id,
}));

export const ACCENT_PRESETS: SettingOption[] = [
  { label: "Purple", value: "#7c3aed" },
  { label: "Blue", value: "#2563eb" },
  { label: "Emerald", value: "#059669" },
  { label: "Amber", value: "#d97706" },
  { label: "Rose", value: "#e11d48" },
];

export const APPEARANCE_SPECS: SettingItemSpec[] = [
  {
    key: "theme",
    name: "Base color scheme",
    description: "Choose between the built-in light and dark themes.",
    type: "dropdown",
    options: themeOptions,
    keywords: ["theme", "color scheme", "dark", "light"],
  },
  {
    key: "accentColor",
    name: "Accent color",
    description: "Accent color for buttons, highlights, and active tabs.",
    type: "color",
    options: ACCENT_PRESETS,
    keywords: ["accent", "color", "highlight"],
  },
  {
    key: "fontFamily",
    name: "Interface font",
    description: "Customize the font used for the interface and editor.",
    type: "text",
    placeholder: "Inter, sans-serif",
    keywords: ["font", "typography"],
  },
  {
    key: "fontSize",
    name: "Font size",
    description: "Quickly adjust the base font size.",
    type: "slider",
    min: 12,
    max: 24,
    step: 1,
    keywords: ["font", "size", "zoom"],
  },
  {
    key: "zoomLevel",
    name: "Zoom level",
    description: "Adjust the scale of the entire interface.",
    type: "slider",
    min: 80,
    max: 150,
    step: 5,
    keywords: ["zoom", "scale", "size"],
  },
];
