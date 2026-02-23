import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

export const TASK_CHECKBOX_THEME = EditorView.baseTheme({
  ".cm-task-marker": {
    display: "inline-flex",
    alignItems: "center",
    marginRight: "0.35em",
  },
  ".cm-task-checkbox": {
    width: "14px",
    height: "14px",
    accentColor: "var(--sat-editor-task-accent, #22c55e)",
  },
});

export class TaskCheckboxWidget extends WidgetType {
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

export function buildTaskDecorations(view: EditorView) {
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

export const taskListPlugin = ViewPlugin.fromClass(
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
