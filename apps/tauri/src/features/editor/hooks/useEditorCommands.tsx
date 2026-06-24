import { selectAll } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import {
  IconBold,
  IconClipboard,
  IconCopy,
  IconExternalLink,
  IconH1,
  IconH2,
  IconH3,
  IconItalic,
  IconLink,
  IconScissors,
  IconSelect,
  IconStrikethrough,
} from "@tabler/icons-react";
import { useCommandStore } from "@workspace/commands";
import { useEffect } from "react";

/**
 * Hook that registers editor-formatting commands into the global command
 * palette. Must be called from a component with access to a CodeMirror
 * EditorView instance (e.g., via EditorComponent's onViewReady callback).
 */
export function useEditorCommands(view: EditorView | null) {
  const register = useCommandStore((s) => s.register);
  const unregister = useCommandStore((s) => s.unregister);

  useEffect(() => {
    if (!view) return;

    const wrapSelection = (prefix: string, suffix: string = prefix) => {
      const { from, to } = view.state.selection.main;
      const selectedText = view.state.sliceDoc(from, to);

      if (
        selectedText.startsWith(prefix) &&
        selectedText.endsWith(suffix) &&
        selectedText.length >= prefix.length + suffix.length
      ) {
        view.dispatch({
          changes: {
            from,
            to,
            insert: selectedText.slice(prefix.length, -suffix.length),
          },
          selection: {
            anchor: from,
            head: from + (selectedText.length - prefix.length - suffix.length),
          },
        });
      } else {
        view.dispatch({
          changes: {
            from,
            to,
            insert: `${prefix}${selectedText}${suffix}`,
          },
          selection: {
            anchor: from + prefix.length,
            head: to + prefix.length,
          },
        });
      }
      view.focus();
    };

    const applyToLineStart = (prefix: string) => {
      const { from } = view.state.selection.main;
      const line = view.state.doc.lineAt(from);

      if (line.text.startsWith(prefix)) {
        view.dispatch({
          changes: {
            from: line.from,
            to: line.from + prefix.length,
            insert: "",
          },
        });
      } else {
        view.dispatch({
          changes: {
            from: line.from,
            to: line.from,
            insert: prefix,
          },
        });
      }
      view.focus();
    };

    const commands = [
      {
        id: "editor:bold",
        name: "Bold",
        category: "Format",
        icon: <IconBold size={16} />,
        hotkeys: ["Ctrl+B"],
        callback: () => wrapSelection("**"),
      },
      {
        id: "editor:italic",
        name: "Italic",
        category: "Format",
        icon: <IconItalic size={16} />,
        hotkeys: ["Ctrl+I"],
        callback: () => wrapSelection("*"),
      },
      {
        id: "editor:strikethrough",
        name: "Strikethrough",
        category: "Format",
        icon: <IconStrikethrough size={16} />,
        callback: () => wrapSelection("~~"),
      },
      {
        id: "editor:link",
        name: "WikiLink",
        category: "Editor",
        icon: <IconLink size={16} />,
        callback: () => wrapSelection("[[", "]]"),
      },
      {
        id: "editor:external-link",
        name: "External Link",
        category: "Editor",
        icon: <IconExternalLink size={16} />,
        callback: () => wrapSelection("[", "](url)"),
      },
      {
        id: "editor:h1",
        name: "Heading 1",
        category: "Format",
        icon: <IconH1 size={16} />,
        callback: () => applyToLineStart("# "),
      },
      {
        id: "editor:h2",
        name: "Heading 2",
        category: "Format",
        icon: <IconH2 size={16} />,
        callback: () => applyToLineStart("## "),
      },
      {
        id: "editor:h3",
        name: "Heading 3",
        category: "Format",
        icon: <IconH3 size={16} />,
        callback: () => applyToLineStart("### "),
      },
      {
        id: "editor:select-all",
        name: "Select All",
        category: "Editor",
        icon: <IconSelect size={16} />,
        hotkeys: ["Ctrl+A"],
        callback: () => selectAll(view),
      },
      {
        id: "editor:cut",
        name: "Cut",
        category: "Editor",
        icon: <IconScissors size={16} />,
        hotkeys: ["Ctrl+X"],
        callback: () => document.execCommand("cut"),
      },
      {
        id: "editor:copy",
        name: "Copy",
        category: "Editor",
        icon: <IconCopy size={16} />,
        hotkeys: ["Ctrl+C"],
        callback: () => document.execCommand("copy"),
      },
      {
        id: "editor:paste",
        name: "Paste",
        category: "Editor",
        icon: <IconClipboard size={16} />,
        hotkeys: ["Ctrl+V"],
        callback: () => {
          navigator.clipboard.readText().then((text) => {
            const { from, to } = view.state.selection.main;
            view.dispatch({ changes: { from, to, insert: text } });
            view.focus();
          });
        },
      },
    ];

    commands.forEach((cmd) => {
      register(cmd);
    });

    return () => {
      commands.forEach((cmd) => {
        unregister(cmd.id);
      });
    };
  }, [view, register, unregister]);
}
