import type { FrontmatterEntry, FrontmatterValue } from "./types";

export type FrontmatterIconName =
  | "file-text"
  | "calendar"
  | "clock"
  | "tag"
  | "link"
  | "list"
  | "check"
  | "hash"
  | "note";

interface FrontmatterIconSpec {
  name: FrontmatterIconName;
  label: string;
  paths: string[];
}

const ICONS: Record<FrontmatterIconName, FrontmatterIconSpec> = {
  "file-text": {
    name: "file-text",
    label: "Note",
    paths: [
      "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
      "M14 2v6h6",
      "M8 13h8",
      "M8 17h8",
    ],
  },
  calendar: {
    name: "calendar",
    label: "Date",
    paths: [
      "M8 2v4",
      "M16 2v4",
      "M3 10h18",
      "M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
    ],
  },
  clock: {
    name: "clock",
    label: "Date time",
    paths: ["M12 6v6l4 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  },
  tag: {
    name: "tag",
    label: "Tag",
    paths: [
      "M20.59 13.41 12 22 2 12 10.59 3.41A2 2 0 0 1 12 3h7a2 2 0 0 1 2 2v7a2 2 0 0 1-.41 1.41Z",
      "M16 8h.01",
    ],
  },
  link: {
    name: "link",
    label: "Link",
    paths: [
      "M10 13a5 5 0 0 1 0-7l1.5-1.5a5 5 0 0 1 7 7L17 13",
      "M14 11a5 5 0 0 1 0 7L12.5 19.5a5 5 0 0 1-7-7L7 11",
    ],
  },
  list: {
    name: "list",
    label: "List",
    paths: [
      "M8 6h13",
      "M8 12h13",
      "M8 18h13",
      "M3 6h.01",
      "M3 12h.01",
      "M3 18h.01",
    ],
  },
  check: {
    name: "check",
    label: "Checkbox",
    paths: ["m9 12 2 2 4-4", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  },
  hash: {
    name: "hash",
    label: "Number",
    paths: ["M4 9h16", "M4 15h16", "M10 3 8 21", "M16 3l-2 18"],
  },
  note: {
    name: "note",
    label: "Text",
    paths: [
      "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
      "M14 2v6h6",
    ],
  },
};

function createSvg(paths: string[]): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

function isFrontmatterObject(
  v: FrontmatterValue,
): v is Exclude<FrontmatterValue, "None"> {
  return typeof v !== "string";
}

function variantKey(
  v: Exclude<FrontmatterValue, "None">,
  name: string,
): boolean {
  const lower = name.toLowerCase();
  return Object.keys(v).some((key) => key.toLowerCase() === lower);
}

function resolveIconName(entry: FrontmatterEntry): FrontmatterIconName {
  const key = entry.key.trim().toLowerCase();
  if (key === "title") return "file-text";
  if (key === "created_at" || key === "created at") return "calendar";
  if (
    key === "last_updated_at" ||
    key === "updated_at" ||
    key === "last updated at"
  ) {
    return "clock";
  }
  if (key === "tags") return "tag";
  if (key === "aliases") return "link";
  if (key === "status") return "check";
  if (key === "summary") return "note";
  if (key === "type") return "file-text";

  const value = entry.value;
  if (!isFrontmatterObject(value)) return "note";
  if (variantKey(value, "List")) return "list";
  if (variantKey(value, "Checkbox")) return "check";
  if (variantKey(value, "DateTime")) return "clock";
  if (variantKey(value, "Date")) return "calendar";
  if (variantKey(value, "Number")) return "hash";
  if (variantKey(value, "Link")) return "link";
  if (variantKey(value, "Text")) return "note";
  return "note";
}

export function createFrontmatterIcon(entry: FrontmatterEntry): HTMLElement {
  const spec = ICONS[resolveIconName(entry)];
  const wrap = document.createElement("span");
  wrap.className = "cm-fm-icon";
  wrap.setAttribute("aria-hidden", "true");
  wrap.title = spec.label;
  wrap.appendChild(createSvg(spec.paths));
  return wrap;
}
