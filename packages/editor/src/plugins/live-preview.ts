import { Decoration, DecorationSet, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";

export const LIVE_PREVIEW_THEME = EditorView.baseTheme({
    ".cm-line.cm-live-heading-1": {
        fontSize: "2.5em",
        fontWeight: "700",
        lineHeight: "1.2",
        paddingTop: "1.5rem",
        paddingBottom: "0.5rem",
    },
    ".cm-line.cm-live-heading-2": {
        fontSize: "2.0em",
        fontWeight: "650",
        lineHeight: "1.2",
        paddingTop: "1.2rem",
        paddingBottom: "0.4rem",
    },
    ".cm-line.cm-live-heading-3": {
        fontSize: "1.6em",
        fontWeight: "600",
        lineHeight: "1.3",
        paddingTop: "1.0rem",
        paddingBottom: "0.3rem",
    },
    ".cm-line.cm-live-heading-4": {
        fontSize: "1.4em",
        fontWeight: "600",
        lineHeight: "1.35",
        paddingTop: "0.8rem",
        paddingBottom: "0.2rem",
    },
    ".cm-line.cm-live-heading-5": {
        fontSize: "1.2em",
        fontWeight: "600",
        lineHeight: "1.4",
        paddingTop: "0.6rem",
        paddingBottom: "0.1rem",
    },
    ".cm-line.cm-live-heading-6": {
        fontSize: "1.1em",
        fontWeight: "600",
        lineHeight: "1.45",
        paddingTop: "0.4rem",
        paddingBottom: "0.1rem",
    },
    ".cm-line.cm-live-heading-7": {
        fontSize: "1.0em",
        fontWeight: "600",
        lineHeight: "1.5",
        paddingTop: "0.2rem",
        paddingBottom: "0.1rem",
        color: "#cbd5e1",
    },
    ".cm-line.cm-live-blockquote": {
        borderLeft: "3px solid #334155",
        paddingLeft: "0.9rem",
        color: "#cbd5f5",
    },
    ".cm-line.cm-live-code": {
        backgroundColor: "#0a0f1a",
    },
    ".cm-live-inline-code": {
        fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        backgroundColor: "#111827",
        borderRadius: "4px",
        padding: "0.1rem 0.3rem",
    },
    ".cm-code-lang": {
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        fontSize: "0.65rem",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#94a3b8",
        backgroundColor: "#0f172a",
        border: "1px solid #1f2937",
        borderRadius: "999px",
        padding: "0.1rem 0.45rem",
        marginRight: "0.35rem",
    },
    ".cm-live-hide": {
        display: "none",
    },
});

export class CodeLangWidget extends WidgetType {
    constructor(private readonly lang: string) {
        super();
    }

    eq(other: CodeLangWidget) {
        return other.lang === this.lang;
    }

    toDOM() {
        const el = document.createElement("span");
        el.className = "cm-code-lang";
        el.textContent = this.lang;
        return el;
    }
}

export const HEADING_CLASS: Record<string, string> = {
    ATXHeading1: "cm-live-heading-1",
    ATXHeading2: "cm-live-heading-2",
    ATXHeading3: "cm-live-heading-3",
    ATXHeading4: "cm-live-heading-4",
    ATXHeading5: "cm-live-heading-5",
    ATXHeading6: "cm-live-heading-6",
    ATXHeading7: "cm-live-heading-7",
    SetextHeading1: "cm-live-heading-1",
    SetextHeading2: "cm-live-heading-2",
};

export const HEADING_7_RE = /^(\s{0,3}#{7}\s+)/;

export const HIDE_MARKS = new Set([
    "HeaderMark",
    "QuoteMark",
    "LinkMark",
    "EmphasisMark",
    "CodeMark",
    "ListMark",
]);

export function buildLivePreviewDecorations(view: EditorView) {
    const widgets: any[] = [];
    const activeLine = view.hasFocus
        ? view.state.doc.lineAt(view.state.selection.main.head)
        : null;

    const addLineClass = (pos: number, className: string) => {
        widgets.push(Decoration.line({ class: className }).range(pos, pos));
    };

    for (const range of view.visibleRanges) {
        const rangeFrom = range.from;
        const rangeTo = range.to;

        const tree = ensureSyntaxTree(view.state, rangeTo, 50);
        const resolvedTree = tree ?? syntaxTree(view.state);
        const isInCodeBlock = (pos: number) => {
            for (
                let cursor: any = resolvedTree.resolve(pos, 1);
                cursor;
                cursor = cursor.parent
            ) {
                const name = cursor.type.name;
                if (name === "FencedCode" || name === "CodeBlock") {
                    return true;
                }
            }
            return false;
        };

        resolvedTree.iterate({
            from: rangeFrom,
            to: rangeTo,
            enter: (node) => {
                const name = node.type.name;
                const onActiveLine = activeLine
                    ? node.from >= activeLine.from && node.to <= activeLine.to
                    : false;

                if (!onActiveLine && HIDE_MARKS.has(name)) {
                    // Exception: Do not hide CodeMark if it belongs to a FencedCode block (triple backticks)
                    // Otherwise, the entire FencedCode block collapses visually.
                    let shouldHide = true;
                    if (name === "CodeMark" && node.node.parent?.type.name === "FencedCode") {
                        shouldHide = false;
                    }

                    if (shouldHide) {
                        widgets.push(
                            Decoration.mark({ class: "cm-live-hide" }).range(node.from, node.to)
                        );
                    }
                }

                if (name === "CodeInfo" && !onActiveLine) {
                    const lang = view.state.doc.sliceString(node.from, node.to).trim();
                    if (lang) {
                        widgets.push(
                            Decoration.replace({ widget: new CodeLangWidget(lang) }).range(node.from, node.to)
                        );
                    } else {
                        widgets.push(Decoration.replace({}).range(node.from, node.to));
                    }
                }

                const headingClass = HEADING_CLASS[name];
                if (headingClass) {
                    const line = view.state.doc.lineAt(node.from);
                    addLineClass(line.from, headingClass);
                }

                if (name === "BlockQuote") {
                    const startLine = view.state.doc.lineAt(
                        Math.max(node.from, rangeFrom),
                    );
                    const endLine = view.state.doc.lineAt(Math.min(node.to, rangeTo));
                    for (
                        let lineNumber = startLine.number;
                        lineNumber <= endLine.number;
                        lineNumber += 1
                    ) {
                        const line = view.state.doc.line(lineNumber);
                        addLineClass(line.from, "cm-live-blockquote");
                    }
                }

                if (name === "FencedCode" || name === "CodeBlock") {
                    const startLine = view.state.doc.lineAt(
                        Math.max(node.from, rangeFrom),
                    );
                    const endLine = view.state.doc.lineAt(Math.min(node.to, rangeTo));
                    for (
                        let lineNumber = startLine.number;
                        lineNumber <= endLine.number;
                        lineNumber += 1
                    ) {
                        const line = view.state.doc.line(lineNumber);
                        addLineClass(line.from, "cm-live-code");
                    }
                }

                if (name === "InlineCode") {
                    widgets.push(
                        Decoration.mark({ class: "cm-live-inline-code" }).range(node.from, node.to)
                    );
                }
            },
        });

        const startLine = view.state.doc.lineAt(rangeFrom);
        const endLine = view.state.doc.lineAt(rangeTo);
        for (
            let lineNumber = startLine.number;
            lineNumber <= endLine.number;
            lineNumber += 1
        ) {
            const line = view.state.doc.line(lineNumber);
            const match = HEADING_7_RE.exec(line.text);
            if (!match || isInCodeBlock(line.from)) {
                continue;
            }

            addLineClass(line.from, "cm-live-heading-7");

            if (!activeLine || lineNumber !== activeLine.number) {
                const markerStart = line.from;
                const markerEnd = markerStart + match[1].length;
                widgets.push(
                    Decoration.mark({ class: "cm-live-hide" }).range(markerStart, markerEnd)
                );
            }
        }
    }

    return Decoration.set(widgets, true);
}

export const livePreviewPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildLivePreviewDecorations(view);
        }

        update(update: {
            docChanged: boolean;
            viewportChanged: boolean;
            selectionSet: boolean;
            view: EditorView;
        }) {
            if (update.docChanged || update.viewportChanged || update.selectionSet) {
                this.decorations = buildLivePreviewDecorations(update.view);
            }
        }
    },
    {
        decorations: (value) => value.decorations,
    },
);
