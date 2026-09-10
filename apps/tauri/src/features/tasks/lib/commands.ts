/**
 * Task command callbacks (ADR-048 §10.3).
 *
 * Toggling/cycling edit the CM6 document directly (the tab save flow
 * persists); no IPC needed for these — the source document is the
 * source of truth and the Rust scanner re-parses on the next index.
 */
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { commandService } from "@workspace/commands";
import {
  cycleStatus,
  statusToCheckboxChar,
} from "@workspace/editor";

/**
 * Active markdown view: the focused editor if any, else the first visible
 * one. Same DOM-level access as `features/templates/lib/commands.ts`.
 */
function findActiveMarkdownView(): EditorView | null {
  const focused = EditorView.findFromDOM(
    document.activeElement as HTMLElement,
  );
  if (focused) return focused;
  const els = document.querySelectorAll<HTMLElement>(".cm-editor");
  for (const el of els) {
    const view = EditorView.findFromDOM(el);
    if (view) return view;
  }
  return null;
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
}