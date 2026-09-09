import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
  formatDate,
} from "./date-format";

export interface TemplateContext {
  /** Resolved note title — the `{{title}}` variable. */
  title: string;
  /** Wall-clock anchor for `{{date}}` / `{{time}}` (local timezone). */
  now: Date;
  /** Override for bare `{{date}}`; defaults to `YYYY-MM-DD` (Obsidian parity). */
  dateFormat?: string;
  /** Override for bare `{{time}}`; defaults to `HH:mm` (Obsidian parity). */
  timeFormat?: string;
}

/** `{{var}}` / `{{var:format}}` with optional surrounding whitespace inside the braces. */
const VARIABLE_RE = /\{\{\s*(date|time|title)(?::\s*([^}]+?))?\s*\}\}/g;

/**
 * Expand Obsidian-style template variables:
 * `{{title}}`, `{{date}}`, `{{time}}`, and colon format overrides such as
 * `{{date:YYYY/MM/DD}}`. Formats are Moment-subset tokens rendered by
 * `formatDate` (ADR-036 §Conventions 2). Format overrides win; bare
 * variables fall back to the context defaults.
 */
export function expandTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(
    VARIABLE_RE,
    (match, name: string, format?: string) => {
      switch (name) {
        case "title":
          return ctx.title;
        case "date":
          return formatDate(
            ctx.now,
            format?.trim() || ctx.dateFormat || DEFAULT_DATE_FORMAT,
          );
        case "time":
          return formatDate(
            ctx.now,
            format?.trim() || ctx.timeFormat || DEFAULT_TIME_FORMAT,
          );
        default:
          return match;
      }
    },
  );
}
