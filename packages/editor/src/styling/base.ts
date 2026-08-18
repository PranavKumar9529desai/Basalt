import { syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { defaultHighlightStyleOverride } from "./highlight-override";

const baseTheme = EditorView.theme({
  // NOTE: `&` (cm-editor) and .cm-scroller heights are managed by
  // @uiw/react-codemirror's internal theme (height="100%" prop).
  // We only set styles that are NOT conflicting with that.
  "&": {
    backgroundColor: "transparent",
    fontSize: "16px",
    fontFamily: "var(--sat-font-sans)",
    fontOpticalSizing: "auto",
    fontFeatureSettings: '"cv01", "ss01"',
  },
  ".cm-scroller": {
    overflowY: "auto",
    overflowX: "hidden",
    // Responsive gutters — at least 32px, scales to 5% on wider panes.
    // Content area ends up ~90% of pane width with comfortable margins.
    padding: "24px max(32px, 5%)",
    fontFamily: "var(--sat-font-sans)",
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

export const CUSTOM_THEME = [
  baseTheme,
  syntaxHighlighting(defaultHighlightStyleOverride),
];
