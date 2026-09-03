/**
 * Diagnostic helper: pretty-print a Lezer syntax tree with node names, ranges
 * and source text. Reads the tree off an EditorState via `syntaxTree`.
 *
 * Use this to make grammar-test failures self-diagnosing, or to eyeball what
 * the markdown parser produced for some input. Two formats:
 *
 *  - `dumpTree(state)`  — indented tree with ranges + text (readable, good for
 *                         debugging in the console or failure messages).
 *  - `treeToString(state)` — compact single-line s-expression (good for
 *                         file-comparing / snapshotting).
 *
 * Both are pure functions of a Tree + doc text — no browser needed.
 */

import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";

/**
 * Render a Lezer tree as an indented multi-line string:
 *
 *   Document [0..41]
 *     ATXHeading1 [0..7]
 *       HeadingMark [0..2]: "# "
 *       Text [2..7]: "Hello"
 *     Paragraph [9..41]
 *       StrongEmphasis [9..20]: "**bold**"
 *         ...
 */
export function dumpTree(tree: Tree, doc: string): string {
  const lines: string[] = [];

  function visit(node: SyntaxNode, depth: number) {
    const indent = "  ".repeat(depth);
    const text = doc.slice(node.from, node.to);
    const label = node.type.isError
      ? `[ERROR] ${node.name}`
      : node.type.isAnonymous
        ? `(anon) ${node.name}`
        : node.name;
    const shown =
      text.length <= 40 ? JSON.stringify(text) : JSON.stringify(text.slice(0, 40) + "…");
    const suffix = node.firstChild ? "" : `: ${shown}`;
    lines.push(`${indent}${label} [${node.from}..${node.to}]${suffix}`);

    for (let child = node.firstChild; child; child = child.nextSibling) {
      visit(child, depth + 1);
    }
  }

  visit(tree.topNode, 0);
  return lines.join("\n");
}

/** Read the syntax tree from an EditorState and pretty-print it. */
export function dumpTreeFromState(state: EditorState): string {
  return dumpTree(syntaxTree(state), state.doc.toString());
}

/**
 * Compact single-line s-expression of the tree, e.g.:
 *   `Document(ATXHeading1(HeadingMark,Text),Paragraph(StrongEmphasis(EmphasisMark,Text,EmphasisMark)))`
 * Uses the Tree's built-in `toString()`.
 */
export function treeToString(state: EditorState): string {
  return syntaxTree(state).toString();
}
