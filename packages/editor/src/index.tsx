import React, { useCallback, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";

export interface EditorProps {
  initialContent?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

// Stable extensions/components to avoid reconfiguring on every keystroke.
const CUSTOM_THEME = EditorView.theme({
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
});

const TASK_CHECKBOX_THEME = EditorView.baseTheme({
  ".cm-task-marker": {
    display: "inline-flex",
    alignItems: "center",
    marginRight: "0.35em",
  },
  ".cm-task-checkbox": {
    width: "14px",
    height: "14px",
    accentColor: "#22c55e",
  },
});

const LIVE_PREVIEW_THEME = EditorView.baseTheme({
  ".cm-line.cm-live-heading-1": {
    fontSize: "2.2rem",
    fontWeight: "700",
    lineHeight: "1.2",
    paddingTop: "0.35rem",
    paddingBottom: "0.25rem",
  },
  ".cm-line.cm-live-heading-2": {
    fontSize: "1.75rem",
    fontWeight: "650",
    lineHeight: "1.25",
    paddingTop: "0.3rem",
    paddingBottom: "0.2rem",
  },
  ".cm-line.cm-live-heading-3": {
    fontSize: "1.4rem",
    fontWeight: "600",
    lineHeight: "1.3",
    paddingTop: "0.25rem",
    paddingBottom: "0.15rem",
  },
  ".cm-line.cm-live-heading-4": {
    fontSize: "1.2rem",
    fontWeight: "575",
    lineHeight: "1.35",
    paddingTop: "0.2rem",
    paddingBottom: "0.1rem",
  },
  ".cm-line.cm-live-heading-5": {
    fontSize: "1.05rem",
    fontWeight: "550",
    lineHeight: "1.4",
    paddingTop: "0.15rem",
    paddingBottom: "0.08rem",
  },
  ".cm-line.cm-live-heading-6": {
    fontSize: "1rem",
    fontWeight: "525",
    lineHeight: "1.45",
    paddingTop: "0.12rem",
    paddingBottom: "0.06rem",
  },
  ".cm-line.cm-live-heading-7": {
    fontSize: "0.95rem",
    fontWeight: "500",
    lineHeight: "1.5",
    paddingTop: "0.1rem",
    paddingBottom: "0.05rem",
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

class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly checked: boolean,
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget) {
    return other.checked === this.checked;
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-task-marker";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "cm-task-checkbox";
    input.checked = this.checked;

    input.addEventListener("click", (event) => {
      event.preventDefault();
      const replacement = this.checked ? "[ ]" : "[x]";
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: replacement },
      });
      view.focus();
    });

    wrapper.appendChild(input);
    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

class CodeLangWidget extends WidgetType {
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

const taskListPlugin = ViewPlugin.fromClass(
  class {
    decorations: ReturnType<typeof buildTaskDecorations>;

    constructor(view: EditorView) {
      this.decorations = buildTaskDecorations(view);
    }

    update(update: {
      docChanged: boolean;
      viewportChanged: boolean;
      view: EditorView;
    }) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildTaskDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  },
);

const HEADING_CLASS: Record<string, string> = {
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

const HEADING_7_RE = /^\s{0,3}#{7}\s+/;

const HIDE_MARKS = new Set([
  "HeaderMark",
  "QuoteMark",
  "LinkMark",
  "EmphasisMark",
  "CodeMark",
  "ListMark",
]);

const livePreviewPlugin = ViewPlugin.fromClass(
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

function buildLivePreviewDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  const activeLine = view.hasFocus
    ? view.state.doc.lineAt(view.state.selection.main.head)
    : null;

  const addLineClass = (pos: number, className: string) => {
    builder.add(pos, pos, Decoration.line({ class: className }));
  };

  for (const range of view.visibleRanges) {
    const rangeFrom = range.from;
    const rangeTo = range.to;

    const tree = ensureSyntaxTree(view.state, rangeTo, 50);
    const resolvedTree = tree ?? syntaxTree(view.state);
    const isInCodeBlock = (pos: number) => {
      for (
        let cursor = resolvedTree.resolve(pos, 1);
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
          builder.add(
            node.from,
            node.to,
            Decoration.mark({ class: "cm-live-hide" }),
          );
        }

        if (name === "CodeInfo" && !onActiveLine) {
          const lang = view.state.doc.sliceString(node.from, node.to).trim();
          if (lang) {
            builder.add(
              node.from,
              node.to,
              Decoration.replace({ widget: new CodeLangWidget(lang) }),
            );
          } else {
            builder.add(node.from, node.to, Decoration.replace({}));
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
          builder.add(
            node.from,
            node.to,
            Decoration.mark({ class: "cm-live-inline-code" }),
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
        const markerStart = line.from + match[1].length;
        const markerEnd = markerStart + 7;
        builder.add(
          markerStart,
          markerEnd,
          Decoration.mark({ class: "cm-live-hide" }),
        );
      }
    }
  }

  return builder.finish();
}

function buildTaskDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();

  for (const range of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        if (node.type.name !== "TaskMarker") return;
        const marker = view.state.doc.sliceString(node.from, node.to);
        const checked = marker.toLowerCase() === "[x]";
        builder.add(
          node.from,
          node.to,
          Decoration.replace({
            widget: new TaskCheckboxWidget(node.from, node.to, checked),
          }),
        );
      },
    });
  }

  return builder.finish();
}

export const Editor: React.FC<EditorProps> = ({
  initialContent = "",
  value,
  onChange,
  className = "",
}) => {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(initialContent);
  const content = isControlled ? (value as string) : internalValue;

  const handleChange = useCallback(
    (val: string) => {
      if (!isControlled) {
        setInternalValue(val);
      }
      if (onChange) {
        onChange(val);
      }
    },
    [isControlled, onChange],
  );

  const editorExtensions = useMemo(
    () => [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      oneDark,
      CUSTOM_THEME,
      TASK_CHECKBOX_THEME,
      taskListPlugin,
      LIVE_PREVIEW_THEME,
      livePreviewPlugin,
      EditorView.lineWrapping,
    ],
    [],
  );

  return (
    <div className={`w-full h-full flex flex-col bg-zinc-950 ${className}`}>
      <div className="flex-1 overflow-hidden">
        <CodeMirror
          value={content}
          height="100%"
          extensions={editorExtensions}
          onChange={handleChange}
          className="h-full"
        />
      </div>
    </div>
  );
};
