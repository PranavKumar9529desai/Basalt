import type { SettingItemSpec } from "../types";

/**
 * Templates core-plugin specs (ADR-037 §7 / spec §5). Declarative — the
 * plugin gets a fully-styled settings tab with zero React UI code.
 */
export const TEMPLATES_SPECS: SettingItemSpec[] = [
  {
    key: "templateFolder",
    name: "Template folder",
    description:
      "Folder containing template notes, relative to the vault root. Any Markdown file in it becomes insertable.",
    type: "text",
    placeholder: "Templates",
    keywords: ["template", "folder", "insert"],
  },
];