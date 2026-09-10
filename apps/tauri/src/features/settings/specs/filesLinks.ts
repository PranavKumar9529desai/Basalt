import type { SettingItemSpec } from "../types";

/**
 * Files & links options specs (ADR-037 §7.D / spec §5.4).
 */
export const FILES_LINKS_SPECS: SettingItemSpec[] = [
  {
    key: "defaultNoteLocation",
    name: "Default location for new notes",
    description: "Where newly created notes are saved.",
    type: "dropdown",
    options: [
      { label: "Vault root", value: "vault-root" },
      { label: "Same folder as current note", value: "same-folder" },
      { label: "Specified folder", value: "specified-folder" },
    ],
    keywords: ["new note", "location", "folder"],
  },
  {
    key: "newLinkFormat",
    name: "New link format",
    description: "How new internal links are formatted.",
    type: "dropdown",
    options: [
      { label: "[[Wikilink]]", value: "wikilink" },
      { label: "[Markdown](file.md)", value: "markdown" },
    ],
    keywords: ["link", "wikilink", "markdown"],
  },
  {
    key: "autoUpdateLinks",
    name: "Automatically update internal links",
    description:
      "Update links inside all notes when a note is renamed or moved.",
    type: "toggle",
    keywords: ["rename", "move", "links"],
  },
  {
    key: "attachmentFolder",
    name: "Attachment folder path",
    description: "Folder where pasted or dragged attachments are stored.",
    type: "text",
    placeholder: "_attachments",
    keywords: ["attachment", "folder", "paste"],
  },
  {
    key: "attachmentOrganization",
    name: "Attachment organization",
    description: "How attachments are arranged inside the attachment folder.",
    type: "dropdown",
    options: [
      { label: "Flat", value: "flat" },
      { label: "By note", value: "by_note" },
      { label: "By date", value: "by_date" },
      { label: "By type", value: "by_type" },
    ],
    keywords: ["attachment", "organization", "folder"],
  },
];
