import { syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { defaultHighlightStyleOverride } from "./highlight-override";

const baseTheme = EditorView.theme({
  "&": {
    height: "100%",
    maxHeight: "100%",
    minHeight: "0",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "transparent",
    fontSize: "16px",
    fontFamily: "var(--sat-font-sans)",
    fontOpticalSizing: "auto",
    fontFeatureSettings: '"cv01", "ss01"',
  },
  ".cm-scroller": {
    flex: "1 1 auto",
    minHeight: "0",
    height: "100%",
    maxHeight: "100%",
    overflowY: "auto",
    overflowX: "visible",
    padding: "24px 32px",
    fontFamily: "var(--sat-font-sans)",
    // border: "2px solid red",
    display: "flex",
    justifyContent: "center",
  },
  ".cm-content": {
    fontFamily: "inherit",
    // border: "2px solid blue",
    width: "100%",
    maxWidth: "45rem",
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
