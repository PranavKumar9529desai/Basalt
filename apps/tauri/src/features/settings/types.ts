import type React from "react";

/**
 * Settings domain types (ADR-037).
 *
 * The declarative schema (`SettingItemSpec`) + section registry
 * (`SettingSectionDef`) power every settings tab: plugins describe
 * fields as data and receive fully-styled, searchable rows with zero
 * hand-built React UI. Complex tabs (Hotkeys, Appearance, plugin
 * managers) opt into a custom `component` instead.
 */

/** Sidebar navigation category for a settings section. */
export type SettingsGroup = "options" | "core-plugins" | "community-plugins";

/** The interactive control widget rendered on the right of a setting row. */
export type SettingControlType =
  | "toggle" // Boolean switch
  | "text" // Text input
  | "number" // Number input
  | "dropdown" // Select dropdown
  | "slider" // Range slider
  | "button" // Single button
  | "button-group" // Multiple buttons (e.g. Log in + Sign up)
  | "color"; // Accent color swatch picker

export interface SettingOption {
  label: string;
  value: string;
}

export interface SettingButtonSpec {
  text: string;
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost";
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}

export interface SettingItemSpec {
  /** Unique store key in the settings store (optional for stateless action buttons). */
  key?: string;
  /** Setting title. */
  name: string;
  /** Setting description; supports ReactNode for rich text and documentation links. */
  description?: React.ReactNode;
  /** If present, renders a SettingHeading sub-section divider above this item. */
  heading?: string;
  /** Heading subtext if `heading` is specified. */
  headingDescription?: string;
  /** Interactive control widget type. */
  type: SettingControlType;
  /** Placeholder for text/number inputs. */
  placeholder?: string;
  /** Options list for dropdown type. */
  options?: SettingOption[];
  /** Min, max, step for slider / number types. */
  min?: number;
  max?: number;
  step?: number;
  /** Button specification for "button" type. */
  button?: SettingButtonSpec;
  /** Button array for "button-group" type. */
  buttons?: SettingButtonSpec[];
  /** Keywords to assist search indexing. */
  keywords?: string[];
  /** Disabled state or predicate. */
  disabled?: boolean | (() => boolean);
  /** Custom change handler if intercepting or transforming values. */
  onChange?: (value: unknown) => void;
}

export interface SettingSectionDef {
  /** Unique section id, e.g. "general", "editor", "templates", "dailies". */
  id: string;
  /** Human-readable title displayed in the left nav. */
  label: string;
  /** Panel header subtitle shown under the section title (spec §3.1). */
  description?: string;
  /** Navigation category. */
  group: SettingsGroup;
  /** Tabler icon component rendered in the navigation row. */
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Ordering weight within the group (lower numbers sort first). */
  order?: number;
  /** Owning plugin ID if this section belongs to a core or community plugin. */
  pluginId?: string;
  /** Dynamic predicate: if provided and returns false, section is hidden. */
  isEnabled?: () => boolean;
  /**
   * Custom React component for complex settings tabs (e.g. Hotkeys,
   * Appearance, CorePlugins). May be lazy-loaded via React.lazy().
   */
  component?: React.ComponentType;
  /**
   * Declarative item specifications. If `component` is omitted,
   * SettingsPanel renders these items automatically using standard
   * SettingItem rows.
   */
  specs?: SettingItemSpec[];
}

/** One searchable record in the settings deep-search index (ADR-037 §5). */
export interface SettingSearchEntry {
  sectionId: string;
  sectionLabel: string;
  itemName: string;
  itemDescription?: string;
  keywords: string[];
}
