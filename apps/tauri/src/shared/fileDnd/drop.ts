/**
 * fileDnd/drop — resolve where a file-tree drop lands and execute it.
 *
 * Cross-feature orchestration (shared layer): the drop target is decided at
 * pointerup by hit-testing the element under the cursor, then routed to the
 * owning feature — an editor pane (wikilink at the caret). The receiver is
 * looked up at execution time, never captured.
 */
import type { EditorView } from "@codemirror/view";
import { editorControllerRegistry } from "../../features/editor";
import type { DraggedFile } from "../../features/vault";

/** CM6's root view element carries the `.cm-editor` class; matching it back
 *  to the registry entry whose view owns that element resolves the pane. */
function findEditorView(cm: Element): EditorView | null {
  let found: EditorView | null = null;
  editorControllerRegistry.forEach((controller) => {
    if (found) return;
    if (controller.getView()?.dom === cm) found = controller.getView();
  });
  return found;
}

/** Note name without the `.md`/`.canvas` extension — the wikilink target. */
function wikiLinkText(file: DraggedFile): string {
  return file.name.replace(/\.(md|canvas)$/i, "") || file.name;
}

function insertWikiLink(view: EditorView, file: DraggedFile): void {
  const insert = `[[${wikiLinkText(file)}]]`;
  view.dispatch({
    changes: { from: view.state.selection.main.head, insert },
  });
  view.focus();
}

/** Resolve and execute a drop at screen (x, y). Returns true if handled. */
export function dispatchFileDrop(
  file: DraggedFile,
  x: number,
  y: number,
): boolean {
  const el = document.elementFromPoint(x, y);
  if (!el) return false;

  const cm = el.closest(".cm-editor");
  if (cm) {
    const view = findEditorView(cm);
    if (view) {
      insertWikiLink(view, file);
      return true;
    }
    return false;
  }

  return false;
}
