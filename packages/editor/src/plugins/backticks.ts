import { KeyBinding } from "@codemirror/view";

export const backticksKeymap: KeyBinding[] = [
    {
        key: "`",
        run: (view) => {
            const { state } = view;
            const selection = state.selection.main;

            // If there's selected text, let default behavior handle it
            if (!selection.empty) return false;

            const pos = selection.head;
            const line = state.doc.lineAt(pos);

            // Check if we are typing the third backtick on the line
            // i.e., the characters immediately preceding the cursor are "``"
            const prefix = line.text.slice(0, pos - line.from);

            if (prefix.endsWith("``")) {
                // We type the 3rd backtick, creating a markdown code block.
                // Obsidian behavior: Insert "\n\n```" and place cursor on the empty middle line
                view.dispatch({
                    changes: {
                        from: pos,
                        insert: "`\n\n```"
                    },
                    selection: { anchor: pos + 2 } // Move cursor after the first \n, leaving the middle line blank
                });
                return true;
            }

            return false;
        }
    }
];
