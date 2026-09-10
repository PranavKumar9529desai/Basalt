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

/** Where pasted/dropped attachments are saved. */
export const ATTACHMENT_FOLDER_DEFAULT = "_attachments";

/** Canonical defaults for every setting. Add new settings here. */
const DEFAULTS = {
  theme: "dark" as string,
  tabClickOpenBehavior: "vscode" as TabClickOpenBehavior,
  attachmentFolder: ATTACHMENT_FOLDER_DEFAULT as string,
  /** How attachments are organized under the attachment folder. */
  attachmentOrganization: "flat" as "flat" | "by_note" | "by_type" | "by_date",
  /** Template for attachment file naming. */
  attachmentNaming: "{original_name}" as
    | "{original_name}"
    | "{note_name}-{n}"
    | "{date}-{original_name}",
  /** Auto-rename attachments when the parent note is renamed. */
  renameAttachmentsWithNote: true as boolean,
  /** Relative folder containing template notes (Templates plugin). */
  templateFolder: "Templates" as string,
  /** Folder where new daily notes are created (Daily notes plugin). */
  dailyNotesFolder: "Daily" as string,
  /** Daily note file-name pattern (Moment-style tokens, may contain slashes). */
  dailyNoteDateFormat: "YYYY-MM-DD" as string,
  /** Template file to apply to new daily notes; empty = blank note. */
  dailyNoteTemplate: "" as string,
  /** Auto-update to the latest stable release (General). */
  autoUpdates: true as boolean,
  /** Auto-update to early access builds (General). */
  earlyAccess: false as boolean,
  /** Display language code (General). */
  language: "en" as string,
  /** Accent color override; empty = follow the active theme (Appearance). */
  accentColor: "" as string,
  /** Interface font family override; empty = token default (Appearance). */
  fontFamily: "" as string,
  /** Base interface font size in px (Appearance). */
  fontSize: 14 as number,
  /** Interface zoom percentage (Appearance). */
  zoomLevel: 100 as number,
  /** Default view mode for new tabs (Editor). */
  defaultViewMode: "live-preview" as "live-preview" | "reading",
  /** Center and limit text line width for reading comfort (Editor). */
  readableLineLength: true as boolean,
  /** CommonMark strict line break rules (Editor). */
  strictLineBreaks: false as boolean,
  /** Show line numbers in the editor gutter (Editor). */
  showLineNumbers: true as boolean,
  /** Allow collapsing sections underneath Markdown headings (Editor). */
  foldHeading: true as boolean,
  /** Auto-close brackets and markdown formatting pairs (Editor). */
  autoPairBrackets: true as boolean,
  /** Indentation unit: 2 spaces, 4 spaces, or a tab (Editor). */
  tabSize: "2" as "2" | "4" | "tab",
  /** Vim modal editing keybindings (Editor). */
  vimMode: false as boolean,
  /** Where newly created notes are saved (Files & links). */
  defaultNoteLocation: "vault-root" as
    | "vault-root"
    | "same-folder"
    | "specified-folder",
  /** Format used for new internal links (Files & links). */
  newLinkFormat: "wikilink" as "wikilink" | "markdown",
  /** Update internal links when a note is renamed or moved (Files & links). */
  autoUpdateLinks: true as boolean,
  /** Per-core-plugin enabled state (Core plugins manager). Absent = enabled. */
  enabledPlugins: {} as Record<string, boolean>,
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

/** Imperative read of a single setting — for module scope / command callbacks. */
export function getSetting<K extends SettingsKey>(key: K): SettingsValues[K] {
  return useSettingsStore.getState().values[key] as SettingsValues[K];
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

/** String-keyed read — used by declarative SettingsFields (keys are string literals). */
export function readSetting(key: string): unknown {
  return useSettingsStore.getState().values[key];
}

/** String-keyed write — persists like `setSetting`, used by SettingsFields. */
export function writeSetting(key: string, value: unknown) {
  useSettingsStore.getState().set(key, value);
  invoke("set_setting", { key, value }).catch((err) => {
    console.error(`Failed to persist setting "${key}":`, err);
  });
}

/** Settings whose value is a plain string — the only kind the settings UI edits. */
export type StringSettingKey = {
  [K in SettingsKey]: SettingsValues[K] extends string ? K : never;
}[SettingsKey];

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
