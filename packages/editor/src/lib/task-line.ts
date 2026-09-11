/**
 * Task line composition — TS mirror of the Rust canonical serializer
 * (`crates/basalt-task/src/serializer.rs`). Layout:
 *
 *   `<indent>- [<status>] <description> [ <priority>] [ ➕<date>]
 *    [ 📅<date>] [ ⏳<date>] [ 🛫<date>] [ ✅<date>] [ ❌<date>]
 *    [ 🔁<rule>] [ 🆔<id>] [ ⛔<dep>]* [ 🏁<on-completion>] [ #tag]*`
 *
 * Used by the task create/edit modal so mutations become plain text
 * dispatches into the editor doc (ADR-048 — tasks are text; the editor is
 * the only file writer). Kept in sync with the Rust tests in serializer.rs.
 */

import { statusToCheckboxChar } from "../input/task-signifiers";

/** Priority name → emoji (mirrors `priority_emoji` in basalt-task signifiers). */
export function priorityToEmoji(priority: string | undefined): string | null {
  switch (priority) {
    case "highest":
      return "🔺";
    case "high":
      return "⏫"; // U+23EB U+FE0F — matches the Rust literal
    case "medium":
      return "🔼";
    case "low":
      return "🔽";
    case "lowest":
      return "⏬"; // U+23EC U+FE0F — matches the Rust literal
    default:
      return null; // "none" / "" — no signifier
  }
}

export interface TaskLineParts {
  indent?: string;
  /** Status name — see `statusToCheckboxChar` (defaults to "todo"). */
  status?: string;
  description: string;
  priority?: string;
  created?: string;
  due?: string;
  scheduled?: string;
  start?: string;
  done?: string;
  cancelled?: string;
  recurrence?: string;
  tags?: string[];
}

/** Build the canonical checkbox line from parts (Rust serializer mirror). */
export function buildTaskLine(parts: TaskLineParts): string {
  const indent = parts.indent ?? "";
  let out = `${indent}- [${statusToCheckboxChar(parts.status ?? "todo")}] ${parts.description}`;

  const priority = priorityToEmoji(parts.priority);
  if (priority) out += ` ${priority}`;
  out += appendDate("➕", parts.created);
  out += appendDate("📅", parts.due);
  out += appendDate("⏳", parts.scheduled);
  out += appendDate("🛫", parts.start);
  out += appendDate("✅", parts.done);
  out += appendDate("❌", parts.cancelled);
  if (parts.recurrence) out += ` 🔁${parts.recurrence}`;
  for (const tag of parts.tags ?? []) {
    out += ` #${tag.trimStart().replace(/^#/, "")}`;
  }
  return out;
}

/** Append ` <emoji><value>` when value is present (glued — Rust layout). */
function appendDate(emoji: string, value?: string): string {
  return value ? ` ${emoji}${value}` : "";
}
