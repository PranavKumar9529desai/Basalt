import { Extension } from "@codemirror/state";
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
    onContextMenu: (state: ContextMenuState) => void
): Extension {
    return EditorView.domEventHandlers({
        contextmenu: (event, view) => {
            event.preventDefault();

            const { from, to } = view.state.selection.main;
            const text = view.state.sliceDoc(from, to);

            // If no selection, we might want to know what word is under the cursor
            // but for now let's just use the main selection.

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
