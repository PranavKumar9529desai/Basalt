import { syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { defaultHighlightStyleOverride } from "./highlight-override";

const baseTheme = EditorView.theme({
  // NOTE: `&` (cm-editor) and .cm-scroller heights are managed by
  // @uiw/react-codemirror's internal theme (height="100%" prop).
  // We only set styles that are NOT conflicting with that.
  "&": {
    backgroundColor: "transparent",
    fontSize: "var(--sat-editor-font-size, 16px)",
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
  // Scroller-injected inline title (ADR-023): the scroller is a flex row by
  // default; column direction stacks the title slot above the content so it
  // scrolls with the document. The scroller remains full width so its
  // scrollbar stays at the pane edge. Its document children use the same
  // configurable readable width, mirroring Obsidian's `.cm-sizer` model.
  "&[data-basalt-title] .cm-scroller": {
    flexDirection: "column",
  },
  "&[data-basalt-title] .cm-scroller > .cm-content": {
    width: "100%",
    maxWidth: "var(--sat-editor-readable-width, 70ch)",
    marginInline: "auto",
    flex: "0 0 auto",
  },
  ".cm-scroller-title": {
    flex: "0 0 auto",
    width: "100%",
    maxWidth: "var(--sat-editor-readable-width, 70ch)",
    marginInline: "auto",
    boxSizing: "border-box",
  },
  ".cm-content": {
    fontFamily: "inherit",
    width: "100%",
    maxWidth: "var(--sat-editor-readable-width, 70ch)",
    marginInline: "auto",
    flex: "0 0 auto",
  },
  ".cm-line": {
    lineHeight: "var(--sat-editor-line-height, 1.6)",
    maxWidth: "var(--sat-editor-readable-width, 70ch)",
  },
  ".cm-scroller-title button, .cm-scroller-title input": {
    fontSize: "var(--sat-editor-title-size, 2em)",
    fontWeight: "var(--sat-editor-title-weight, 700)",
    lineHeight: "var(--sat-editor-title-line-height, 1.15)",
    letterSpacing: "var(--sat-editor-title-letter-spacing, -0.03em)",
    color: "var(--sat-editor-heading1, var(--sat-text-primary))",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeft: "2px solid var(--sat-editor-accent, #a78bfa)",
  },
});

export const BASE_EDITOR_THEME = [
  baseTheme,
  syntaxHighlighting(defaultHighlightStyleOverride),
];
