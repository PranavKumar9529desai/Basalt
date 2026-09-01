import type { OnPasteImageFn } from "../types";
import { EditorView } from "@codemirror/view";

/**
 * CM6 extension that intercepts paste events containing image data.
 *
 * When a paste event includes `image/*` items, the handler:
 *   1. Reads the binary data from the clipboard.
 *   2. Calls `onPasteImage(data, filename)` — the feature layer owns the IPC.
 *   3. On success, inserts `![[relPath]]` at the current cursor position.
 *
 * Returns an empty extension array when no callback is provided (no-op).
 * The `![[…]]` insert is undoable via CM6's built-in undo history.
 */
export function pasteImageExtension(
  onPasteImage?: OnPasteImageFn,
): ReturnType<typeof EditorView.extension> {
  if (!onPasteImage) return [];

  return EditorView.domEventHandlers({
    paste(event, view) {
      const items = (event as ClipboardEvent).clipboardData?.items;
      if (!items) return false;

      for (const item of items) {
        if (!item.type.startsWith("image/")) continue;

        event.preventDefault();

        const file = item.getAsFile();
        if (!file) continue;

        const filename = file.name || "pasted-image.png";

        file.arrayBuffer().then((buf) => {
          const data = new Uint8Array(buf);
          onPasteImage(data, filename).then((relPath) => {
            if (!relPath) return;
            const insertText = `![[${relPath}]]`;
            view.dispatch({
              changes: {
                from: view.state.selection.main.head,
                insert: insertText,
              },
            });
          });
        });

        // Return true to tell CM6 we handled the event.
        return true;
      }

      return false;
    },
  });
}
