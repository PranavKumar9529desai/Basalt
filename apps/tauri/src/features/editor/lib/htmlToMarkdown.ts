import TurndownService from "turndown";

let service: TurndownService | null = null;

/**
 * Convert rich-clipboard HTML to Markdown for the "keep formatting" paste
 * mode. The TurndownService is expensive to construct (rule graph), so it is
 * built once and reused; instances are immutable for our purposes.
 */
export function htmlToMarkdown(html: string): string {
  const td = (service ??= new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
  }));
  const md = td.turndown(html).trim();
  return md;
}