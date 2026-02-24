import type { EditorView } from "@codemirror/view";
import {
  IconBold,
  IconCopy,
  IconH1,
  IconH2,
  IconH3,
  IconItalic,
  IconScissors,
  IconSelectAll,
  IconStrikethrough,
} from "@tabler/icons-react";
import { useCallback, useMemo } from "react";
import { useCommand } from "../../../editor/src/commands/context";

export const useEditorCommands = (view: EditorView | undefined) => {
  const wrapSelection = useCallback(
    (prefix: string, suffix: string = prefix) => {
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const text = view.state.sliceDoc(from, to);
      view.dispatch({
        changes: { from, to, insert: `${prefix}${text}${suffix}` },
        selection: { anchor: from + prefix.length + text.length },
      });
      view.focus();
    },
    [view],
  );

  const applyToLineStart = useCallback(
    (prefix: string) => {
      if (!view) return;
      const { head } = view.state.selection.main;
      const line = view.state.doc.lineAt(head);
      view.dispatch({
        changes: { from: line.from, to: line.from, insert: prefix },
      });
      view.focus();
    },
    [view],
  );

  // Register Core Commands
  useCommand(
    useMemo(
      () => ({
        id: "editor:bold",
        name: "Bold",
        category: "Editor",
        icon: <IconBold className="w-4 h-4" />,
        callback: () => {
          wrapSelection("**");
        },
      }),
      [wrapSelection],
    ),
  );

  useCommand(
    useMemo(
      () => ({
        id: "editor:italic",
        name: "Italic",
        category: "Editor",
        icon: <IconItalic className="w-4 h-4" />,
        callback: () => {
          wrapSelection("*");
        },
      }),
      [wrapSelection],
    ),
  );

  useCommand(
    useMemo(
      () => ({
        id: "editor:strikethrough",
        name: "Strikethrough",
        category: "Editor",
        icon: <IconStrikethrough className="w-4 h-4" />,
        callback: () => {
          wrapSelection("~~");
        },
      }),
      [wrapSelection],
    ),
  );

  useCommand(
    useMemo(
      () => ({
        id: "editor:h1",
        name: "Heading 1",
        category: "Editor",
        icon: <IconH1 className="w-4 h-4" />,
        callback: () => {
          applyToLineStart("# ");
        },
      }),
      [applyToLineStart],
    ),
  );

  useCommand(
    useMemo(
      () => ({
        id: "editor:h2",
        name: "Heading 2",
        category: "Editor",
        icon: <IconH2 className="w-4 h-4" />,
        callback: () => {
          applyToLineStart("## ");
        },
      }),
      [applyToLineStart],
    ),
  );

  useCommand(
    useMemo(
      () => ({
        id: "editor:h3",
        name: "Heading 3",
        category: "Editor",
        icon: <IconH3 className="w-4 h-4" />,
        callback: () => {
          applyToLineStart("### ");
        },
      }),
      [applyToLineStart],
    ),
  );

  useCommand(
    useMemo(
      () => ({
        id: "editor:copy",
        name: "Copy",
        category: "Editor",
        icon: <IconCopy className="w-4 h-4" />,
        callback: () => {
          document.execCommand("copy");
        },
      }),
      [],
    ),
  );

  useCommand(
    useMemo(
      () => ({
        id: "editor:cut",
        name: "Cut",
        category: "Editor",
        icon: <IconScissors className="w-4 h-4" />,
        callback: () => {
          document.execCommand("cut");
        },
      }),
      [],
    ),
  );

  useCommand(
    useMemo(
      () => ({
        id: "editor:select-all",
        name: "Select All",
        category: "Editor",
        icon: <IconSelectAll className="w-4 h-4" />,
        callback: () => {
          view?.dispatch({
            selection: { anchor: 0, head: view.state.doc.length },
          });
        },
      }),
      [view],
    ),
  );

  return { wrapSelection, applyToLineStart };
};
