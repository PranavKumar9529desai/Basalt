import { Decoration, DecorationSet, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { StateField, EditorState, RangeSetBuilder } from "@codemirror/state";

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
    ".cm-code-header": {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        margin: "0",
        padding: "8px 12px 0 12px",
        backgroundColor: "#0a0f1a",
        borderTopLeftRadius: "6px",
        borderTopRightRadius: "6px",
        userSelect: "none",
    },
    ".cm-code-lang-tag": {
        fontSize: "0.75rem",
        letterSpacing: "0.05em",
        color: "#64748b",
        fontWeight: "600",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    },
    ".cm-code-copy-btn": {
        background: "transparent",
        border: "none",
        color: "#64748b",
        cursor: "pointer",
        padding: "4px 8px",
        borderRadius: "4px",
        fontSize: "0.75em",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        transition: "all 0.2s",
    },
    ".cm-code-copy-btn:hover": {
        backgroundColor: "#1e293b",
        color: "#cbd5e1",
    },
    ".cm-code-footer": {
        display: "block",
        backgroundColor: "#0a0f1a",
        height: "8px",
        borderBottomLeftRadius: "6px",
        borderBottomRightRadius: "6px",
    },
    ".cm-live-inline-code": {
        fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        backgroundColor: "#111827",
        borderRadius: "4px",
        padding: "0.1rem 0.3rem",
    },
    ".cm-live-hide": {
        display: "none",
    },
});

export class CodeHeaderWidget extends WidgetType {
    constructor(
        private readonly lang: string,
        private readonly codeFrom: number,
        private readonly codeTo: number
    ) {
        super();
    }

    eq(other: CodeHeaderWidget) {
        return other.lang === this.lang && other.codeFrom === this.codeFrom && other.codeTo === this.codeTo;
    }

    toDOM(view: EditorView) {
        const container = document.createElement("div");
        container.className = "cm-code-header";

        const langSpan = document.createElement("span");
        langSpan.className = "cm-code-lang-tag";
        langSpan.textContent = this.lang;
        container.appendChild(langSpan);

        const copyBtn = document.createElement("button");
        copyBtn.className = "cm-code-copy-btn";
        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copy`;

        copyBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const fullText = view.state.doc.sliceString(this.codeFrom, this.codeTo);
            const lines = fullText.split('\n');
            if (lines.length >= 2) {
                const innerCode = lines.slice(1, -1).join('\n');
                navigator.clipboard.writeText(innerCode).then(() => {
                    const originalHtml = copyBtn.innerHTML;
                    copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Copied!`;
                    setTimeout(() => {
                        copyBtn.innerHTML = originalHtml;
                    }, 2000);
                });
            }
        });

        container.contentEditable = "false";
        container.appendChild(copyBtn);
        return container;
    }

    ignoreEvent() {
        return true;
    }
}

export class CodeFooterWidget extends WidgetType {
    eq() { return true; }
    toDOM() {
        const div = document.createElement("div");
        div.className = "cm-code-footer";
        return div;
    }
    ignoreEvent() {
        return true;
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

export const codeBlockStateField = StateField.define<DecorationSet>({
    create(state) {
        return buildCodeBlockDecorations(state);
    },
    update(value, tr) {
        if (tr.docChanged || tr.selection) {
            return buildCodeBlockDecorations(tr.state);
        }
        return value;
    },
    provide: (f) => EditorView.decorations.from(f)
});

function buildCodeBlockDecorations(state: EditorState) {
    const builder = new RangeSetBuilder<Decoration>();
    const headPos = state.selection.main.head;

    // To remain O(1) in the viewport, we only iterate the visible syntax tree nodes using viewport
    // Unfortunately state doesn't have visibleRanges, but typically docChanged logic works efficiently inside CodeMirror 6 StateFields if we build linearly. 
    // Here we use iterate over the entire parsed tree but it's optimized by CM6 as the tree is built incrementally.

    // For block decorations, CodeMirror strictly requires them to be built sequentially in a StateField.
    // Let's iterate linearly:

    syntaxTree(state).iterate({
        enter: (node) => {
            if (node.type.name === "FencedCode") {
                const hasCursor = headPos >= node.from && headPos <= node.to;
                const startLine = state.doc.lineAt(node.from);
                const endLine = state.doc.lineAt(node.to);

                if (!hasCursor) {
                    const langMatch = startLine.text.match(/^```([^\s]*)/);
                    const lang = langMatch ? langMatch[1] : "";

                    builder.add(
                        startLine.from,
                        startLine.to,
                        Decoration.replace({
                            widget: new CodeHeaderWidget(lang, node.from, node.to),
                            block: true
                        })
                    );

                    if (endLine.number > startLine.number) {
                        builder.add(
                            endLine.from,
                            endLine.to,
                            Decoration.replace({
                                widget: new CodeFooterWidget(),
                                block: true
                            })
                        );
                    }
                }

                return false;
            }
        }
    });

    return builder.finish();
}

export function buildLivePreviewDecorations(view: EditorView) {
    const widgets: any[] = [];
    const activeLine = view.hasFocus
        ? view.state.doc.lineAt(view.state.selection.main.head)
        : null;
    const headPos = view.state.selection.main.head;

    const addLineClass = (pos: number, className: string) => {
        widgets.push(Decoration.line({ class: className }).range(pos, pos));
    };

    for (const range of view.visibleRanges) {
        const rangeFrom = range.from;
        const rangeTo = range.to;

        const tree = ensureSyntaxTree(view.state, rangeTo, 50);
        const resolvedTree = tree ?? syntaxTree(view.state);

        const codeBlockRanges: { from: number, to: number }[] = [];
        const isInCodeBlock = (pos: number) => {
            return codeBlockRanges.some(r => pos >= r.from && pos <= r.to);
        };

        // First pass to identify code block ranges for line styling and other checks
        resolvedTree.iterate({
            from: rangeFrom,
            to: rangeTo,
            enter: (node) => {
                const name = node.type.name;
                if (name === "FencedCode" || name === "CodeBlock") {
                    codeBlockRanges.push({ from: node.from, to: node.to });

                    const hasCursor = headPos >= node.from && headPos <= node.to;
                    const startLine = view.state.doc.lineAt(node.from);
                    const endLine = view.state.doc.lineAt(node.to);

                    if (name === "FencedCode") {
                        const startRenderLine = Math.max(startLine.number, view.state.doc.lineAt(rangeFrom).number);
                        const endRenderLine = Math.min(endLine.number, view.state.doc.lineAt(rangeTo).number);

                        for (let lineNumber = startRenderLine; lineNumber <= endRenderLine; lineNumber += 1) {
                            if (!hasCursor && (lineNumber === startLine.number || lineNumber === endLine.number)) {
                                continue;
                            }
                            const line = view.state.doc.line(lineNumber);
                            addLineClass(line.from, "cm-live-code");
                        }
                    } else if (name === "CodeBlock") {
                        const startRenderLine = Math.max(startLine.number, view.state.doc.lineAt(rangeFrom).number);
                        const endRenderLine = Math.min(endLine.number, view.state.doc.lineAt(rangeTo).number);

                        for (let lineNumber = startRenderLine; lineNumber <= endRenderLine; lineNumber += 1) {
                            const line = view.state.doc.line(lineNumber);
                            addLineClass(line.from, "cm-live-code");
                        }
                    }
                    return false; // Don't descend into code blocks for other decorations in this pass
                }
            }
        });

        // Second pass for other decorations
        resolvedTree.iterate({
            from: rangeFrom,
            to: rangeTo,
            enter: (node) => {
                const name = node.type.name;

                // Skip nodes inside code blocks as their line styling is handled above
                if (isInCodeBlock(node.from)) {
                    return false;
                }

                const onActiveLine = activeLine
                    ? node.from >= activeLine.from && node.to <= activeLine.to
                    : false;

                if (!onActiveLine && HIDE_MARKS.has(name)) {
                    widgets.push(
                        Decoration.mark({ class: "cm-live-hide" }).range(node.from, node.to)
                    );
                }

                const headingClass = HEADING_CLASS[name];
                if (headingClass) {
                    const line = view.state.doc.lineAt(node.from);
                    addLineClass(line.from, headingClass);
                }

                if (name === "BlockQuote") {
                    const startLine = view.state.doc.lineAt(Math.max(node.from, rangeFrom));
                    const endLine = view.state.doc.lineAt(Math.min(node.to, rangeTo));
                    for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
                        const line = view.state.doc.line(lineNumber);
                        addLineClass(line.from, "cm-live-blockquote");
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
