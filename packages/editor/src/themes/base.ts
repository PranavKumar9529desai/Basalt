import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const baseTheme = EditorView.theme({
  "&": {
    height: "100%",
    minHeight: "0",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "transparent",
    fontSize: "16px",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
  ".cm-scroller": {
    flex: "1 1 auto",
    minHeight: "0",
    height: "100%",
    overflow: "auto",
    padding: "24px 32px",
  },
  ".cm-content": {
    fontFamily: "inherit",
  },
  ".cm-line": {
    lineHeight: "1.6",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeft: "2px solid var(--sat-editor-accent, #a78bfa)",
  },
});

/**
 * Use this to override default syntax highlighting of CodeMirror.
 * For example, preventing default underlines on headings.
 */
const defaultHighlightStyleOverride = HighlightStyle.define([
  { tag: t.heading, textDecoration: "none" },
]);

export const CUSTOM_THEME = [
  baseTheme,
  syntaxHighlighting(defaultHighlightStyleOverride),
];
