import { useEffect, useRef } from "react";
import { EditorState, Extension, Range, Text } from "@codemirror/state";
import { EditorView, lineNumbers, Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { tags as t } from "@lezer/highlight";
import type { Highlight } from "../types";

// Minimal token styling mapped to the app's --sat-* theme tokens so the
// preview matches the editor without depending on the (in-progress) editor package.
const highlightStyle = HighlightStyle.define([
  { tag: t.heading1, color: "var(--sat-accent-primary)", fontWeight: "700", fontSize: "1.7em" },
  { tag: t.heading2, color: "var(--sat-accent-primary)", fontWeight: "700", fontSize: "1.45em" },
  { tag: t.heading3, color: "var(--sat-accent-primary)", fontWeight: "600", fontSize: "1.25em" },
  { tag: t.heading4, color: "var(--sat-accent-primary)", fontWeight: "600", fontSize: "1.12em" },
  { tag: t.heading5, color: "var(--sat-accent-primary)", fontWeight: "600", fontSize: "1.04em" },
  { tag: t.heading6, color: "var(--sat-text-primary)", fontWeight: "600", fontSize: "1em" },
  { tag: t.keyword, color: "var(--sat-accent-primary)" },
  { tag: t.string, color: "var(--sat-text-primary)" },
  { tag: t.comment, color: "var(--sat-text-muted)", fontStyle: "italic" },
  { tag: t.number, color: "var(--sat-text-primary)" },
  { tag: t.link, color: "var(--sat-accent-primary)", textDecoration: "underline" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.monospace, fontFamily: "var(--font-mono, monospace)" },
]);

function languageForPath(path: string): Extension {
  if (path.endsWith(".md")) {
    return markdown({ base: markdownLanguage, codeLanguages: languages });
  }
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const desc = languages.find(
    (l) => l.alias?.includes(ext) || (l.filename?.test(path) ?? false),
  );
  return (desc ? desc.support : []) as Extension;
}

function buildDecorations(
  doc: Text,
  matchLine: number,
  highlights: Highlight[],
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const lineNo = Math.max(1, Math.min(matchLine, doc.lines));
  const line = doc.line(lineNo);
  ranges.push(
    Decoration.line({
      attributes: {
        style: "background: color-mix(in srgb, var(--sat-accent-primary) 12%, transparent);",
      },
    }).range(line.from),
  );
  for (const h of highlights) {
    const from = line.from + h.start;
    const to = line.from + h.end;
    if (from >= line.from && to <= line.to && from < to) {
      ranges.push(
        Decoration.mark({
          attributes: {
            style:
              "background: var(--sat-accent-primary); color: var(--sat-text-inverse); border-radius: 2px;",
          },
        }).range(from, to),
      );
    }
  }
  return Decoration.set(ranges);
}

// Hide raw markdown markers (###, **, `, [], (), etc.) so the preview reads like a
// rendered note. Read-only: markers are always hidden (no cursor-aware reveal).
const HIDDEN_MARKS = new Set([
  "HeaderMark",
  "LinkMark",
  "EmphasisMark",
  "CodeMark",
  "CodeInfo",
  "URL",
  "HardBreak",
]);

const hiddenMark = Decoration.mark({ class: "cm-markdoc-hidden" });

function buildRichDecorations(view: EditorView): DecorationSet {
  const widgets: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (!HIDDEN_MARKS.has(node.name)) return;
        // For headings, also swallow the space after '#' so text isn't indented.
        const end =
          node.name === "HeaderMark"
            ? Math.min(node.to + 1, view.state.doc.length)
            : node.to;
        widgets.push(hiddenMark.range(node.from, end));
      },
    });
  }
  return Decoration.set(widgets);
}

const richMarkdownPreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildRichDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildRichDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function makeState(
  text: string,
  path: string,
  matchLine: number,
  highlights: Highlight[],
): EditorState {
  const tmp = EditorState.create({ doc: text });
  const deco = buildDecorations(tmp.doc, matchLine, highlights);
  return EditorState.create({
    doc: text,
    extensions: [
      lineNumbers(),
      richMarkdownPreview,
      syntaxHighlighting(highlightStyle),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.theme(
        {
          "&": { height: "100%", backgroundColor: "transparent" },
          ".cm-scroller": {
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "12px",
            lineHeight: "1.5",
          },
          ".cm-gutters": {
            backgroundColor: "transparent",
            border: "none",
            color: "var(--sat-text-muted)",
          },
          ".cm-markdoc-hidden": { display: "none" },
        },
        { dark: true },
      ),
      EditorView.decorations.of(deco),
    ],
  });
}

interface PreviewPaneProps {
  text: string;
  path: string;
  matchLine: number;
  highlights: Highlight[];
}

export function PreviewPane({ text, path, matchLine, highlights }: PreviewPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: makeState(text, path, matchLine, highlights),
    });
    viewRef.current = view;
    return () => view.destroy();
    // Create once; updates handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.setState(makeState(text, path, matchLine, highlights));
    const lineNo = Math.max(1, Math.min(matchLine, view.state.doc.lines));
    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.doc.line(lineNo).from, {
        y: "center",
      }),
    });
  }, [text, path, matchLine, highlights]);

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />;
}
