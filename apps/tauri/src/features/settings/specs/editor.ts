import type { SettingItemSpec } from "../types";

/**
 * Editor options specs (ADR-037 §7.C / spec §5.3).
 */
export const EDITOR_SPECS: SettingItemSpec[] = [
  {
    key: "defaultViewMode",
    name: "Default view mode for new tabs",
    description: "Choose between live preview editor and reading view.",
    type: "dropdown",
    options: [
      { label: "Live preview", value: "live-preview" },
      { label: "Reading view", value: "reading" },
    ],
    keywords: ["view", "live preview", "reading"],
  },
  {
    key: "readableLineLength",
    name: "Readable line length",
    description: "Center and limit text line width for reading comfort.",
    type: "toggle",
    keywords: ["line", "width", "reading"],
  },
  {
    key: "strictLineBreaks",
    name: "Strict line breaks",
    description:
      "A single line break will not create a new paragraph unless ended with two spaces.",
    type: "toggle",
    keywords: ["markdown", "paragraph", "line break"],
  },
  {
    key: "showLineNumbers",
    name: "Show line numbers",
    description: "Display line numbers in the editor gutter.",
    type: "toggle",
    keywords: ["gutter", "numbers"],
  },
  {
    key: "foldHeading",
    name: "Fold heading",
    description: "Allow collapsing sections underneath Markdown headings.",
    type: "toggle",
    keywords: ["fold", "collapse", "heading"],
  },
  {
    key: "autoPairBrackets",
    name: "Auto-pair brackets and quotes",
    description: "Automatically close brackets and markdown formatting pairs.",
    type: "toggle",
    keywords: ["auto pair", "brackets", "quotes"],
  },
  {
    key: "tabSize",
    name: "Tab indent size",
    description: "Number of spaces per indentation level.",
    type: "dropdown",
    options: [
      { label: "2 spaces", value: "2" },
      { label: "4 spaces", value: "4" },
      { label: "Tab", value: "tab" },
    ],
    keywords: ["indent", "tabs", "spaces"],
  },
  {
    key: "vimMode",
    name: "Vim key bindings",
    description: "Enable modal editing using Vim keybindings.",
    type: "toggle",
    keywords: ["vim", "modal", "vi"],
  },
];
