import type { MarkdownConfig } from "@lezer/markdown";

/**
 * Lezer-markdown extension that parses YAML frontmatter at the top of a document.
 *
 * Without this, `@lezer/markdown` treats the opening `---` as a ThematicBreak
 * (horizontal rule) and the closing `---` as a setext-heading underline,
 * breaking both the visual decoration and heading detection.
 *
 * When installed, the parser emits a `YAMLFrontMatter` node spanning from the
 * opening `---` through the closing `---` (inclusive). The decoration layer in
 * `frontmatter.ts` then picks up this node and applies the correct styling.
 */
export const yamlFrontmatterExtension: MarkdownConfig = {
  defineNodes: [{ name: "YAMLFrontMatter", block: true }],
  parseBlock: [
    {
      name: "YAMLFrontMatter",
      // Run before HorizontalRule so the opening `---` is not stolen by the HR parser.
      before: "HorizontalRule",
      parse(cx, line) {
        // Frontmatter must start at the very beginning of the document.
        if (cx.lineStart !== 0 || line.text !== "---") return false;

        // Consume lines until we find the closing delimiter or reach EOF.
        while (cx.nextLine()) {
          if (line.text === "---" || line.text === "...") {
            cx.nextLine(); // advance past the closing delimiter
            break;
          }
        }

        cx.addElement(cx.elt("YAMLFrontMatter", 0, cx.prevLineEnd()));
        return true;
      },
    },
  ],
};
