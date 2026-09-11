/**
 * Task command callbacks (ADR-048 §10.3).
 *
 * Toggling/cycling edit the CM6 document directly (the tab save flow
 * persists); no IPC needed for these — the source document is the
 * source of truth and the Rust scanner re-parses on the next index.
 *
 * Create/edit open the modal; edit resolves the target line from the
 * cursor and the note path from the context injected by the shell
 * (features never import each other, AGENTS.md §3).
 */
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { commandService } from "@workspace/commands";
import {
  parseTaskSignifiers,
  cycleStatus,
  statusToCheckboxChar,
} from "@workspace/editor";

import { useTaskModalStore } from "../store";

/** Shell-injected context: resolves the active note path outside React. */
let taskContext: { getActivePath: () => string | null } = {
  getActivePath: () => null,
};

export function setTaskContext(ctx: typeof taskContext): void {
  taskContext = ctx;
}
/**
 * Active markdown view: the focused editor if any, else the first visible
 * one. Same DOM-level access as `features/templates/lib/commands.ts`.
 */
function findActiveMarkdownView(): EditorView | null {
  const focused = EditorView.findFromDOM(document.activeElement as HTMLElement);
  if (focused) return focused;
  const els = document.querySelectorAll<HTMLElement>(".cm-editor");
  for (const el of els) {
    const view = EditorView.findFromDOM(el);
    if (view) return view;
  }
  return null;
}

/** Local-time ISO date (YYYY-MM-DD) for tomorrow. */
function isoTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** A TaskMarker syntax node spanning the checkbox `[x]` text. */
interface TaskMarkerShape {
  from: number;
  to: number;
  text: string;
}

/** The TaskMarker node on the cursor's line, if any. */
function taskMarkerAtCursor(view: EditorView): TaskMarkerShape | null {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const tree = syntaxTree(view.state);

  let target: TaskMarkerShape | null = null;
  tree.iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      if (node.type.name !== "TaskMarker") return;
      target = {
        from: node.from,
        to: node.to,
        text: view.state.doc.sliceString(node.from, node.to),
      };
      return false;
    },
  });
  return target;
}

/** Status name from a checkbox marker text like "[x]" or "[ ]". */
function statusFromMarker(marker: string): string {
  const c = marker[1] ?? " ";
  switch (c) {
    case "/":
      return "in_progress";
    case "?":
      return "on_hold";
    case "x":
    case "X":
      return "done";
    case "-":
      return "cancelled";
    default:
      return "todo";
  }
}

/** Dispatch a checkbox character replacement on the cursor's task line. */
function replaceMarkerAtCursor(
  view: EditorView,
  marker: TaskMarkerShape,
  nextStatus: string,
) {
  const replacement = `[${statusToCheckboxChar(nextStatus)}]`;
  view.dispatch({
    changes: { from: marker.from, to: marker.to, insert: replacement },
  });
  view.focus();
}

export function registerTaskCommands() {
  commandService.registerCommand("tasks:toggle", () => {
    const view = findActiveMarkdownView();
    if (!view) return;
    const marker = taskMarkerAtCursor(view);
    if (!marker) return;
    const status = statusFromMarker(marker.text);
    const next = status === "done" || status === "cancelled" ? "todo" : "done";
    replaceMarkerAtCursor(view, marker, next);
  });

  commandService.registerCommand("tasks:cycle-status", () => {
    const view = findActiveMarkdownView();
    if (!view) return;
    const marker = taskMarkerAtCursor(view);
    if (!marker) return;
    const status = statusFromMarker(marker.text);
    replaceMarkerAtCursor(view, marker, cycleStatus(status));
  });

  /** Open the modal in edit mode targeting the task line at the cursor. */
  const openEditAtCursor = () => {
    const view = findActiveMarkdownView();
    if (!view) return;
    const marker = taskMarkerAtCursor(view);
    if (!marker) return;
    const path = taskContext.getActivePath();
    if (!path) return;
    const line = view.state.doc.lineAt(marker.from).number;
    useTaskModalStore.getState().openEdit({ path, line });
  };

  commandService.registerCommand("tasks:create", () => {
    useTaskModalStore.getState().openCreate();
  });
  commandService.registerCommand("tasks:edit", () => {
    openEditAtCursor();
  });

  commandService.registerCommand("tasks:set-priority", () => {
    openEditAtCursor();
  });

  commandService.registerCommand("tasks:set-due-date", () => {
    openEditAtCursor();
  });

  commandService.registerCommand("tasks:set-scheduled", () => {
    openEditAtCursor();
  });

  commandService.registerCommand("tasks:postpone", () => {
    const view = findActiveMarkdownView();
    if (!view) return;
    const marker = taskMarkerAtCursor(view);
    if (!marker) return;
    const line = view.state.doc.lineAt(marker.from);
    const tomorrow = isoTomorrow();
    const due = parseTaskSignifiers(line.text)?.due;
    const insert =
      due !== undefined
        ? line.text.replace(
            /\u{1F4C5}\d{4}-\d{2}-\d{2}/u,
            `\u{1F4C5}${tomorrow}`,
          )
        : `${line.text} \u{1F4C5}${tomorrow}`;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert },
    });
    view.focus();
  });
}

// Register at module scope — the codebase convention (search/settings/
// tabCommands all register on import). Without this the palette and the
// CmdOrCtrl+Enter binding find no handler for any tasks:* command.
registerTaskCommands();
