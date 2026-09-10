/**
 * Task signifier parser — lightweight TS mirror of the Rust scanner
 * for use in the CM6 decoration pipeline.
 *
 * Parses priority emoji, date signifiers, recurrence, tags, and status
 * from a markdown task line. Runs only on visible ranges in the editor.
 */

export interface TaskSignifiers {
  status: string;
  priority: string;
  due?: string;
  scheduled?: string;
  start?: string;
  created?: string;
  doneDate?: string;
  cancelled?: string;
  recurrence?: string;
  tags: string[];
}

/** Default status cycle: todo → in_progress → done → todo. */
export const TASK_STATUS_CYCLE: string[] = ["todo", "in_progress", "done"];

/** Status name → checkbox character. */
export function statusToCheckboxChar(status: string): string {
  switch (status) {
    case "todo":
      return " ";
    case "in_progress":
      return "/";
    case "on_hold":
      return "?";
    case "done":
      return "x";
    case "cancelled":
      return "-";
    default:
      return " ";
  }
}

/** Cycle a status name to the next in the default cycle (after done → todo). */
export function cycleStatus(current: string): string {
  const idx = TASK_STATUS_CYCLE.indexOf(current);
  if (idx === -1) return TASK_STATUS_CYCLE[0];
  return TASK_STATUS_CYCLE[(idx + 1) % TASK_STATUS_CYCLE.length];
}

const PRIORITY_MAP: Record<string, string> = {
  "\u{1F53A}": "highest", // 🔺
  "\u{23EB}\u{FE0F}": "high", // ⏫ (with variation selector)
  "\u{23EB}": "high", // ⏫ (without variation selector)
  "\u{1F53C}": "medium", // 🔼
  "\u{1F53D}": "low", // 🔽
  "\u{23EC}\u{FE0F}": "lowest", // ⏬ (with variation selector)
  "\u{23EC}": "lowest", // ⏬ (without variation selector)
};

/** Date signifier emoji → field name. */
const DATE_SIGNIFIERS: Record<string, string> = {
  "\u{1F4C5}": "due", // 📅
  "\u{23F3}": "scheduled", // ⏳
  "\u{1F6EB}": "start", // 🛫
  "\u{2705}": "doneDate", // ✅
  "\u{274C}": "cancelled", // ❌
  "\u{2795}": "created", // ➕
};

/** Recurrence signifier. */
const RECURRENCE_EMOJI = "\u{1F501}"; // 🔁

/** ISO date pattern YYYY-MM-DD. */
const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}/;

/** Is the code point at `i` in `chars` a task signifier emoji? */
function isSignifierAt(chars: string[], i: number): boolean {
  const ch = chars[i];
  return (
    ch in PRIORITY_MAP ||
    ch in DATE_SIGNIFIERS ||
    ch === RECURRENCE_EMOJI
  );
}

/**
 * Extract signifiers from a task line text.
 * Returns null if the line doesn't look like a task.
 */
export function parseTaskSignifiers(lineText: string): TaskSignifiers | null {
  // Must contain a checkbox marker
  const checkboxMatch = lineText.match(/\[[ xX/?-]\]/);
  if (!checkboxMatch) return null;

  // Determine status from checkbox character
  const statusChar = checkboxMatch[0][1];
  let status: string;
  switch (statusChar) {
    case " ":
      status = "todo";
      break;
    case "/":
      status = "in_progress";
      break;
    case "?":
      status = "on_hold";
      break;
    case "x":
    case "X":
      status = "done";
      break;
    case "-":
      status = "cancelled";
      break;
    default:
      status = "todo";
      break;
  }

  const result: TaskSignifiers = {
    status,
    priority: "none",
    tags: [],
  };

  // Code-point iteration (emoji are single code points in JS strings)
  const chars = [...lineText];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    // Priority signifiers
    if (ch in PRIORITY_MAP) {
      result.priority = PRIORITY_MAP[ch];
      continue;
    }

    // Date signifiers — followed by a space then YYYY-MM-DD
    if (ch in DATE_SIGNIFIERS) {
      const field = DATE_SIGNIFIERS[ch];
      if (i + 1 < chars.length && chars[i + 1] === " ") {
        const rest = chars.slice(i + 2).join("");
        const dateMatch = rest.match(ISO_DATE_RE);
        if (dateMatch) {
          (result as unknown as Record<string, unknown>)[field] = dateMatch[0];
        }
      }
      continue;
    }
    // Recurrence signifier — text until the next signifier emoji or EOL
    if (ch === RECURRENCE_EMOJI) {
      let j = i + 1;
      while (j < chars.length && (chars[j] === " " || chars[j] === "\t")) j++;
      const start = j;
      while (j < chars.length && !isSignifierAt(chars, j)) j++;
      result.recurrence = chars.slice(start, j).join("").trimEnd();
      i = j - 1; // the loop's i++ lands on the next signifier (or EOL)
      continue;
    }

    // Tag detection (#word at a word boundary)
    if (
      ch === "#" &&
      (i === 0 || chars[i - 1] === " " || chars[i - 1] === "\t")
    ) {
      const rest = chars.slice(i).join("");
      const tagMatch = rest.match(/^#([a-zA-Z0-9_-]+)/);
      if (tagMatch) {
        result.tags.push(tagMatch[0]);
      }
    }
  }

  return result;
}