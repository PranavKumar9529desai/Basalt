import type { EditorView } from "@codemirror/view";
import {
  IconBold as TablerIconBold,
  IconCopy as TablerIconCopy,
  IconH1 as TablerIconH1,
  IconH2 as TablerIconH2,
  IconH3 as TablerIconH3,
  IconItalic as TablerIconItalic,
  IconScissors as TablerIconScissors,
  IconSelectAll as TablerIconSelectAll,
  IconStrikethrough as TablerIconStrikethrough,
} from "@tabler/icons-react";

const IconBold = TablerIconBold as any;
const IconCopy = TablerIconCopy as any;
const IconH1 = TablerIconH1 as any;
const IconH2 = TablerIconH2 as any;
const IconH3 = TablerIconH3 as any;
const IconItalic = TablerIconItalic as any;
const IconScissors = TablerIconScissors as any;
const IconSelectAll = TablerIconSelectAll as any;
const IconStrikethrough = TablerIconStrikethrough as any;
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
