import { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";

export const FRONTMATTER_THEME = EditorView.baseTheme({
  ".cm-line.cm-live-frontmatter": {
    backgroundColor: "var(--sat-frontmatter-bg, rgba(100,116,139,0.08))",
    color: "var(--sat-frontmatter-text, #94a3b8)",
  },
  ".cm-line.cm-live-frontmatter-fence": {
    color: "var(--sat-frontmatter-fence-color, #475569)",
    fontWeight: "600",
  },
  ".cm-live-frontmatter-key": {
    color: "var(--sat-frontmatter-key-color, #818cf8)",
  },
});

/**
 * Handles YAMLFrontMatter nodes from @codemirror/lang-markdown.
 * Returns true if a frontmatter node was found and decorated.
 */
export function handleFrontmatterNode(
  node: SyntaxNodeRef,
  ctx: DecorationContext,
  collector: DecorationCollector,
): boolean {
  if (node.type.name !== "YAMLFrontMatter") return false;

  const doc = ctx.state.doc;
  const startLine = doc.lineAt(node.from);
  const endLine = doc.lineAt(node.to);

  for (let ln = startLine.number; ln <= endLine.number; ln++) {
    const line = doc.line(ln);
    collector.addLineClass(line.from, "cm-live-frontmatter");

    if (ln === startLine.number || ln === endLine.number) {
      collector.addLineClass(line.from, "cm-live-frontmatter-fence");
    } else {
      const keyMatch = /^([a-zA-Z_][\w-]*)(\s*:)/.exec(line.text);
      if (keyMatch) {
        collector.addMark(
          line.from,
          line.from + keyMatch[1].length,
          "cm-live-frontmatter-key",
        );
      }
    }
  }

  return true;
}

/**
 * Fallback: scans for YAML frontmatter at the top of the document using regex.
 * Call only when no YAMLFrontMatter node was found in the tree.
 */
export function handleFrontmatterFallback(
  ctx: DecorationContext,
  collector: DecorationCollector,
): void {
  const doc = ctx.state.doc;
  if (doc.lines < 2) return;

  const firstLine = doc.line(1);
  if (firstLine.text.trim() !== "---") return;

  collector.addLineClass(firstLine.from, "cm-live-frontmatter");
  collector.addLineClass(firstLine.from, "cm-live-frontmatter-fence");

  for (let ln = 2; ln <= doc.lines; ln++) {
    const line = doc.line(ln);
    collector.addLineClass(line.from, "cm-live-frontmatter");

    if (line.text.trim() === "---") {
      collector.addLineClass(line.from, "cm-live-frontmatter-fence");
      break;
    }

    const keyMatch = /^([a-zA-Z_][\w-]*)(\s*:)/.exec(line.text);
    if (keyMatch) {
      collector.addMark(
        line.from,
        line.from + keyMatch[1].length,
        "cm-live-frontmatter-key",
      );
    }
  }
}
