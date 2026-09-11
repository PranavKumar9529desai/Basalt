import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import {
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";

/**
 * Fresh-task detector — the Obsidian Tasks "type `- [ ]`, get the picker"
 * trigger. Exposes a `onFreshTaskChange(line | null)` callback the shell
 * wires to open the create/edit task modal, so the full capture flow
 * (priority, due/scheduled/start, recurrence, tags) happens inline.
 *
 * "Fresh" = the caret line is an empty todo checkbox (`- [ ]`, `* [ ]`,
 * `1. [ ]`, indented, blockquote) with only whitespace after the marker —
 * i.e. a brand-new task that has not been given a description yet. The
 * callback fires ONCE per transition (null ⇄ line number), never per
 * keystroke.
 */
const FRESH_TASK_RE = /^\s*(?:[-*]|\d+\.) \[ \]\s*$/;

function freshTaskLineAt(state: EditorState): number | null {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  if (line.length === 0 || !FRESH_TASK_RE.test(line.text)) return null;
  if (insideCodeBlock(state, pos)) return null;
  return line.number;
}

/** Is `pos` inside a fenced/indented code block? (Checkboxes there are code.) */
function insideCodeBlock(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    if (node.name.includes("Code")) return true;
    node = node.parent;
  }
  return false;
}

const freshTaskField = StateField.define<number | null>({
  create: (state) => freshTaskLineAt(state),
  update(value, tr) {
    if (!tr.docChanged && !tr.selection) return value;
    return freshTaskLineAt(tr.state);
  },
});

/**
 * Extension that reports caret entry/exit of a fresh task line. Pass no
 * callback (read-only previews, canvas cards) → returns `[]`, no overhead.
 */
export function freshTaskExtension(
  onChange?: (line: number | null) => void,
): Extension {
  if (!onChange) return [];
  return [
    freshTaskField,
    ViewPlugin.fromClass(
      class {
        private last: number | null = null;

        constructor(view: EditorView) {
          this.last = view.state.field(freshTaskField, false) ?? null;
        }

        update(update: ViewUpdate) {
          const next = update.view.state.field(freshTaskField, false) ?? null;
          if (next === this.last) return;
          this.last = next;
          onChange(next);
        }
      },
    ),
  ];
}
