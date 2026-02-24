import { EditorView } from "@codemirror/view";

export const CUSTOM_THEME = EditorView.theme({
    "&": {
        height: "100%",
        backgroundColor: "transparent",
        fontSize: "16px",
        fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    },
    ".cm-scroller": {
        overflow: "auto",
        padding: "24px 32px",
    },
    ".cm-content": {
        maxWidth: "800px",
        margin: "0 auto",
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
