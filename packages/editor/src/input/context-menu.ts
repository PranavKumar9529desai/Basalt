import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * Data needed to render and position the custom context menu.
 */
export interface ContextMenuState {
  x: number;
  y: number;
  selection: {
    from: number;
    to: number;
    text: string;
    isWord: boolean;
  };
}

/**
 * Hook-like function to create a context menu extension.
 * @param onContextMenu Callback called when a right-click occurs.
 */
export function contextMenuExtension(
  onContextMenu: (state: ContextMenuState) => void,
): Extension {
  return EditorView.domEventHandlers({
    contextmenu: (event, view) => {
      event.preventDefault();

      let { from, to } = view.state.selection.main;
      let text = view.state.sliceDoc(from, to);

      // If no text is selected, try to detect the word at the cursor position
      // so the context menu can offer word-level actions (search, format, etc.).
      if (text.length === 0) {
        const word = view.state.wordAt(view.state.selection.main.head);
        if (word) {
          from = word.from;
          to = word.to;
          text = view.state.sliceDoc(from, to);
        }
      }

      onContextMenu({
        x: event.clientX,
        y: event.clientY,
        selection: {
          from,
          to,
          text,
          isWord: text.length > 0 && !text.includes(" "),
        },
      });

      return true;
    },
  });
}
