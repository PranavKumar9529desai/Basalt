import type { SettingItemSpec, SettingSearchEntry } from "../types";
import { APPEARANCE_SPECS } from "./appearance";
import { DAILIES_SPECS } from "./dailies";
import { EDITOR_SPECS } from "./editor";
import { FILES_LINKS_SPECS } from "./filesLinks";
import { GENERAL_SPECS } from "./general";
import { TEMPLATES_SPECS } from "./templates";

/**
 * Aggregated declarative specs map — section id → item specs
 * (ADR-037 §2 / spec §8). Custom-component sections (hotkeys, plugin
 * managers) are not present here; they render via their component.
 */
export const CORE_SPECS: Record<string, SettingItemSpec[]> = {
  general: GENERAL_SPECS,
  appearance: APPEARANCE_SPECS,
  editor: EDITOR_SPECS,
  "files-links": FILES_LINKS_SPECS,
  templates: TEMPLATES_SPECS,
  dailies: DAILIES_SPECS,
};

export { APP_VERSION, GENERAL_SPECS } from "./general";
export { ACCENT_PRESETS } from "./appearance";
export { APPEARANCE_SPECS } from "./appearance";
export { EDITOR_SPECS } from "./editor";
export { FILES_LINKS_SPECS } from "./filesLinks";
export { TEMPLATES_SPECS } from "./templates";
export { DAILIES_SPECS } from "./dailies";

/** Does a spec item match the query? Name, description, or declared keywords. */
export function specMatches(spec: SettingItemSpec, q: string): boolean {
  if (spec.name.toLowerCase().includes(q)) return true;
  if (
    typeof spec.description === "string" &&
    spec.description.toLowerCase().includes(q)
  )
    return true;
  return (spec.keywords ?? []).some((k) => k.toLowerCase().includes(q));
}

/**
 * Build the deep-search index (ADR-037 §5): every section label plus
 * every declarative item becomes a searchable entry.
 */
export function buildSearchIndex(): SettingSearchEntry[] {
  return Object.entries(CORE_SPECS).flatMap(([sectionId, specs]) =>
    specs.map((spec) => ({
      sectionId,
      sectionLabel: sectionId,
      itemName: spec.name,
      itemDescription:
        typeof spec.description === "string" ? spec.description : undefined,
      keywords: spec.keywords ?? [],
    })),
  );
}
