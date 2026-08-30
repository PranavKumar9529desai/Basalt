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
  // Scroller-injected inline title (ADR-023): the scroller is a flex row by
  // default; column direction stacks the title slot above the content so it
  // scrolls with the document. `.cm-content` snaps to full scroller width the
  // way flexGrow in the row axis did. Selection/cursor layers are absolutely
  // positioned and direction-agnostic, so virtualization is unaffected.
  "&[data-basalt-title] .cm-scroller": {
    flexDirection: "column",
  },
  "&[data-basalt-title] .cm-scroller > .cm-content": {
    width: "100%",
  },
  ".cm-scroller-title": {
    flex: "0 0 auto",
    width: "100%",
    boxSizing: "border-box",
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

export const BASE_EDITOR_THEME = [
  baseTheme,
  syntaxHighlighting(defaultHighlightStyleOverride),
];
