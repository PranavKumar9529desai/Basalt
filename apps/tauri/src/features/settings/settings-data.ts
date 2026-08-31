import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

/**
 * Typed settings store — the single source of truth for all user preferences.
 *
 * Backed by Rust's `config.json` (Tier 1: global, non-portable).
 * On boot, `initSettings()` merges the Rust values over these defaults.
 *
 * ## Adding a new setting
 *
 * 1. Add the key with its default to `DEFAULTS`.
 * 2. Consumers read it via `useSetting("yourKey")` — fully typed, no parsing.
 * 3. Write it via `setSetting("yourKey", value)` — persists to Rust automatically.
 */

export type TabClickOpenBehavior = "preview" | "pinned" | "vscode";

/** Canonical defaults for every setting. Add new settings here. */
const DEFAULTS = {
  theme: "dark" as string,
  tabClickOpenBehavior: "vscode" as TabClickOpenBehavior,
};

type SettingsKey = keyof typeof DEFAULTS;
type SettingsValues = typeof DEFAULTS;

interface SettingsStore {
  values: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
}

/**
 * Zustand store for setting values.
 *
 * - Initialized with `DEFAULTS` so early renders have sensible values.
 * - `initSettings()` merges the Rust backend values on top.
 * - `useSetting()` subscribes a component to a single key.
 * - `setSetting()` writes to both the store and the Rust backend.
 */
export const useSettingsStore = create<SettingsStore>()((set) => ({
  values: { ...DEFAULTS },

  set: (key, value) =>
    set((state) => ({ values: { ...state.values, [key]: value } })),
}));

/**
 * Select a single setting value. The component re-renders only when
 * this specific key changes.
 *
 * Must be called inside a React component (uses Zustand `useStore`).
 *
 * @example
 * const theme = useSetting("theme");           // string
 * const behavior = useSetting("tabClickOpenBehavior"); // TabClickOpenBehavior
 */
export function useSetting<K extends SettingsKey>(key: K): SettingsValues[K] {
  return useSettingsStore((state) => state.values[key] as SettingsValues[K]);
}

/**
 * Write a setting value. Updates the Zustand store immediately and
 * persists to the Rust backend (`config.json`) asynchronously.
 *
 * Safe to call from event handlers — fire-and-forget, no await needed.
 *
 * @example
 * setSetting("theme", "light");
 * setSetting("tabClickOpenBehavior", "preview");
 */
export function setSetting<K extends SettingsKey>(
  key: K,
  value: SettingsValues[K],
) {
  useSettingsStore.getState().set(key, value);
  invoke("set_setting", { key, value }).catch((err) => {
    console.error(`Failed to persist setting "${key}":`, err);
  });
}

/**
 * One-time initialization from the Rust boot result.
 * Merges backend values over defaults — missing keys fall back to DEFAULTS.
 *
 * Call this once in Shell (or any component that receives `boot.settings`).
 *
 * @example
 * initSettings(boot.settings);
 */
export function initSettings(backend: Record<string, unknown> | undefined) {
  if (!backend) return;
  const merged = { ...DEFAULTS, ...backend };
  useSettingsStore.getState().set("__init__", undefined);
  useSettingsStore.setState({ values: merged });
}
