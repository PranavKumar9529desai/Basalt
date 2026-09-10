import type { SettingItemSpec } from "../types";

/**
 * Daily notes core-plugin specs (ADR-037 §7 / spec §5).
 */
export const DAILIES_SPECS: SettingItemSpec[] = [
  {
    key: "dailyNotesFolder",
    name: "Daily notes folder",
    description:
      "Where new daily notes are created. Use a nested path (e.g. Journal/2026) to organize by month or year.",
    type: "text",
    placeholder: "Daily",
    keywords: ["daily", "folder", "journal"],
  },
  {
    key: "dailyNoteDateFormat",
    name: "Date format",
    description:
      "File-name pattern for daily notes. Moment-style tokens (YYYY, MMM, DD); slashes create subfolders.",
    type: "text",
    placeholder: "YYYY-MM-DD",
    keywords: ["date", "format", "filename"],
  },
  {
    key: "dailyNoteTemplate",
    name: "Template",
    description:
      "Template file (in the template folder) applied when a new daily note is created. Leave empty for a blank note.",
    type: "text",
    placeholder: "Empty — start with a blank note",
    keywords: ["template", "daily"],
  },
];
