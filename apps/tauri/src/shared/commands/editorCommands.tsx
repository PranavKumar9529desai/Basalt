/**
 * editorCommands — app-level registrations for editor-scoped commands and
 * actions.
 *
 * Architecture: These used to be registered per mounted pane (useEditor /
 * useEditorCommands), so with split panes the same global command id was
 * registered N times ("Overwriting" warnings) and each closure captured one
 * pane's editor. VS Code model instead: register ONCE, at app boot, and
 * resolve the ACTIVE editor at execution time via shared/activeEditor.
 *
 * This module is imported for its side effects from `app-shell/` — the
 * composition root, never from a feature. It imports features/editor +
 * features/tabs through shared/activeEditor, so it lives in shared/.
 *
 * ADR-038 §3 seam: editor-scoped commands live here; rich-table commands in
 * tableCommands.tsx; dev/benchmark harnesses in devBenchmarks.ts.
 */
import { selectAll } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
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
  IconReplace,
  IconScissors,
  IconSearch,
  IconSelect,
  IconStrikethrough,
} from "@tabler/icons-react";
import { commandService } from "@workspace/commands";
import { keybindingService } from "@workspace/keybindings";
import { useRenameSignalStore } from "../../features/editor";
import { resolveActiveController, resolveActiveTab } from "../activeEditor";

/** The active pane's live CodeMirror view, or null when no editor is active. */
export function getActiveView(): EditorView | null {
  return resolveActiveController()?.getView() ?? null;
}

// Keyword actions (Ctrl+S, F2) used to be registered per pane too — the
// same capture bug. Resolve the active tab/controller at execution time.
keybindingService.registerAction("saveActiveFile", () => {
  const controller = resolveActiveController();
  const tab = controller?.activeTab();
  if (controller && tab) {
    void controller.saveTab(tab.id);
  } else {
    window.dispatchEvent(new CustomEvent("basalt:save-active"));
  }
});

keybindingService.registerAction("renameActiveNote", () => {
  const tab = resolveActiveTab();
  if (tab) useRenameSignalStore.getState().request(tab.id);
});

function wrapSelection(view: EditorView, prefix: string, suffix = prefix) {
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
}

function applyToLineStart(view: EditorView, prefix: string) {
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
}

const hasActiveEditor = () => getActiveView() !== null;

const editorCommands = [
  {
    id: "editor:bold",
    name: "Bold",
    category: "Format",
    icon: <IconBold size={16} />,
    callback: () => {
      const view = getActiveView();
      if (view) wrapSelection(view, "**");
    },
  },
  {
    id: "editor:italic",
    name: "Italic",
    category: "Format",
    icon: <IconItalic size={16} />,
    callback: () => {
      const view = getActiveView();
      if (view) wrapSelection(view, "*");
    },
  },
  {
    id: "editor:strikethrough",
    name: "Strikethrough",
    category: "Format",
    icon: <IconStrikethrough size={16} />,
    callback: () => {
      const view = getActiveView();
      if (view) wrapSelection(view, "~~");
    },
  },
  {
    id: "editor:link",
    name: "WikiLink",
    category: "Editor",
    icon: <IconLink size={16} />,
    callback: () => {
      const view = getActiveView();
      if (view) wrapSelection(view, "[[", "]]");
    },
  },
  {
    id: "editor:external-link",
    name: "External Link",
    category: "Editor",
    icon: <IconExternalLink size={16} />,
    callback: () => {
      const view = getActiveView();
      if (view) wrapSelection(view, "[", "](url)");
    },
  },
  {
    id: "editor:h1",
    name: "Heading 1",
    category: "Format",
    icon: <IconH1 size={16} />,
    callback: () => {
      const view = getActiveView();
      if (view) applyToLineStart(view, "# ");
    },
  },
  {
    id: "editor:h2",
    name: "Heading 2",
    category: "Format",
    icon: <IconH2 size={16} />,
    callback: () => {
      const view = getActiveView();
      if (view) applyToLineStart(view, "## ");
    },
  },
  {
    id: "editor:h3",
    name: "Heading 3",
    category: "Format",
    icon: <IconH3 size={16} />,
    callback: () => {
      const view = getActiveView();
      if (view) applyToLineStart(view, "### ");
    },
  },
  {
    id: "editor:find",
    name: "Find…",
    category: "Editor",
    icon: <IconSearch size={16} />,
    callback: () => {
      const view = getActiveView();
      if (view) openSearchPanel(view);
    },
  },
  {
    id: "editor:replace",
    name: "Replace…",
    category: "Editor",
    icon: <IconReplace size={16} />,
    callback: () => {
      const view = getActiveView();
      if (!view) return;
      // The default panel hosts find + replace; focus the replace field.
      openSearchPanel(view);
      const replace = view.dom.querySelector<HTMLInputElement>(
        '.cm-search input[name="replace"]',
      );
      replace?.focus();
      replace?.select();
    },
  },
  {
    id: "editor:select-all",
    name: "Select All",
    category: "Editor",
    icon: <IconSelect size={16} />,
    callback: () => {
      const view = getActiveView();
      if (view) selectAll(view);
    },
  },
  {
    id: "editor:cut",
    name: "Cut",
    category: "Editor",
    icon: <IconScissors size={16} />,
    callback: () => document.execCommand("cut"),
  },
  {
    id: "editor:copy",
    name: "Copy",
    category: "Editor",
    icon: <IconCopy size={16} />,
    callback: () => document.execCommand("copy"),
  },
  {
    id: "editor:paste",
    name: "Paste",
    category: "Editor",
    icon: <IconClipboard size={16} />,
    callback: () => {
      const view = getActiveView();
      if (!view) return;
      navigator.clipboard
        .readText()
        .then((text) => {
          const { from, to } = view.state.selection.main;
          view.dispatch({ changes: { from, to, insert: text } });
          view.focus();
        })
        .catch(() => {
          // Clipboard access can be denied; paste is best-effort here.
        });
    },
  },
];

const commands = editorCommands.map((cmd) => ({
  ...cmd,
  checkCallback: hasActiveEditor,
}));

commands.forEach((cmd) => commandService.register(cmd));