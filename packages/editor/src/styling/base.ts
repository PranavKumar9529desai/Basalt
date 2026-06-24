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
    padding: "24px 32px",
    fontFamily: "var(--sat-font-sans)",
    // No display:flex / justifyContent:center — they cause re-centering
    // shifts when any width change occurs (scrollbar, resize, tab overflow).
    // Centering is handled by .cm-content margin: 0 auto (stable).
  },
  ".cm-content": {
    fontFamily: "inherit",
    // Left-aligned, max-width constrained for readability.
    // No centering — centering caused the content to "shift right" whenever
    // any width change occurred (scrollbar toggle, resize, tab overflow).
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
